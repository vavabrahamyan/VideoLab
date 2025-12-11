import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  HostListener,
  OnDestroy,
  input,
  output,
  signal,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { VgBufferingModule } from '@videogular/ngx-videogular/buffering';
import { VgCoreModule } from '@videogular/ngx-videogular/core';

type SeekDirection = 'forward' | 'backward';
type PlayerUiState = 'playingControlsHidden' | 'playingControlsVisible' | 'paused';

@Component({
  selector: 'app-video-player',
  standalone: true,
  imports: [CommonModule, VgCoreModule, VgBufferingModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './video-player.component.html',
})
export class VideoPlayerComponent implements OnDestroy {
  readonly videoUrl = input<string | null>(null);
  videoUploaded = output<File>();

  readonly uploadedUrl = signal<string | null>(null);
  readonly isDragOver = signal(false);

  readonly effectiveVideoUrl = computed(
    () => this.uploadedUrl() ?? this.videoUrl()
  );

  // Overlay for +/-10 second skip indicator
  readonly seekOverlay = signal<{ direction: SeekDirection; token: number } | null>(
    null
  );
  readonly seekOverlayList = computed(() => {
    const overlay = this.seekOverlay();
    return overlay ? [overlay] : [];
  });

  // UI state machine: playing with hidden/visible controls or paused
  readonly uiState = signal<PlayerUiState>('paused');
  readonly lastInteractionTime = signal<number | null>(null);

  readonly isPaused = computed(() => this.uiState() === 'paused');
  readonly isPlaying = computed(
    () =>
      this.uiState() === 'playingControlsHidden' ||
      this.uiState() === 'playingControlsVisible'
  );
  readonly controlsAreVisible = computed(
    () => this.uiState() !== 'playingControlsHidden'
  );

  // Center button: shown when paused or when playing with visible controls
  readonly showCenterButton = computed(
    () => this.isPaused() || this.uiState() === 'playingControlsVisible'
  );

  readonly currentTime = signal(0);
  readonly duration = signal(0);
  readonly progressPercent = computed(() => {
    const total = this.duration();
    if (!isFinite(total) || total <= 0) return 0;
    return Math.min(100, (this.currentTime() / total) * 100);
  });

  // Fullscreen state (per container, not the whole document)
  readonly isFullscreen = signal(false);

  // Keep the player height within the viewport alongside the surrounding titles
  readonly playerMaxHeight = 'calc(100vh - 200px)';

  @ViewChild('media') media?: ElementRef<HTMLVideoElement>;
  @ViewChild('playerContainer') playerContainer?: ElementRef<HTMLElement>;

  private hideSeekOverlayTimeout?: ReturnType<typeof setTimeout>;
  private seekOverlayToken = 0;
  private clickTimeout?: ReturnType<typeof setTimeout>;
  private hideControlsTimeout?: ReturnType<typeof setTimeout>;

  private readonly SEEK_STEP_SECONDS = 10;
  private readonly CLICK_DELAY_MS = 250;
  private readonly CONTROLS_AUTOHIDE_MS = 3000;

  constructor() {
    // Cleanup object URLs when uploadedUrl changes
    effect((onCleanup) => {
      const url = this.uploadedUrl();
      if (!url) return;

      onCleanup(() => URL.revokeObjectURL(url));
    });
  }

  formatTime(value: number): string {
    if (!isFinite(value) || value < 0) return '0:00';
    const minutes = Math.floor(value / 60);
    const seconds = Math.floor(value % 60)
      .toString()
      .padStart(2, '0');
    return `${minutes}:${seconds}`;
  }

  ngOnDestroy(): void {
    if (this.hideSeekOverlayTimeout) clearTimeout(this.hideSeekOverlayTimeout);
    if (this.clickTimeout) clearTimeout(this.clickTimeout);
    if (this.hideControlsTimeout) clearTimeout(this.hideControlsTimeout);
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver.set(false);
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver.set(true);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver.set(false);
    const file = event.dataTransfer?.files?.[0];
    if (!file || !file.type.startsWith('video/')) return;

    this.#processFile(file);
    this.#resetUiState();
  }

  onFileSelected(event: Event): void {
    const inputEl = event.target as HTMLInputElement;
    const file = inputEl.files?.[0];
    if (file) {
      this.#processFile(file);
      this.#resetUiState();
    }
    inputEl.value = '';
  }

  @HostListener('document:fullscreenchange')
  onFullscreenChange(): void {
    const container = this.playerContainer?.nativeElement;
    const active = document.fullscreenElement;
    this.isFullscreen.set(!!active && active === container);
  }

  @HostListener('window:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    if (
      target?.tagName === 'INPUT' ||
      target?.tagName === 'TEXTAREA' ||
      target?.isContentEditable
    ) {
      return;
    }

    if (event.code === 'Space' || event.key === ' ') {
      event.preventDefault();
      this.togglePlayPause();
      return;
    }

    if (event.key === 'ArrowRight' || event.key === 'l' || event.key === 'L') {
      event.preventDefault();
      this.seekForward();
      return;
    }

    if (event.key === 'ArrowLeft' || event.key === 'j' || event.key === 'J') {
      event.preventDefault();
      this.seekBackward();
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.#adjustVolume(0.05);
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.#adjustVolume(-0.05);
      return;
    }

    if (event.key === 'm' || event.key === 'M') {
      event.preventDefault();
      this.toggleMute();
      return;
    }

    const digit = Number(event.key);
    if (!Number.isInteger(digit) || digit < 0 || digit > 9) return;

    const mediaEl = this.media?.nativeElement;
    if (!mediaEl || !isFinite(mediaEl.duration) || mediaEl.duration <= 0) return;

    const fraction = digit / 10;
    mediaEl.currentTime = mediaEl.duration * fraction;
    this.onUserInteraction();
  }

  onMediaEnded(): void {
    this.uiState.set('paused');
    this.#clearHideControlsTimer();
  }

  onMediaPause(): void {
    this.uiState.set('paused');
    this.#clearHideControlsTimer();
  }

  onMediaPlay(): void {
    this.uiState.set('playingControlsVisible');
    this.#markInteraction();
    this.#restartAutoHideTimer();
  }

  onMetadataLoaded(): void {
    const mediaEl = this.media?.nativeElement;
    if (!mediaEl) return;

    this.duration.set(mediaEl.duration || 0);
  }

  onPointerEnterPlayer(): void {
    this.onUserInteraction();
  }

  onPointerLeavePlayer(): void {
    if (!this.isPlaying()) return;

    this.uiState.set('playingControlsHidden');
    this.#clearHideControlsTimer();
  }

  onScrubInput(event: Event): void {
    const mediaEl = this.media?.nativeElement;
    if (!mediaEl || !isFinite(mediaEl.duration) || mediaEl.duration <= 0) return;

    const input = event.target as HTMLInputElement;
    const nextPercent = Number(input.value);
    if (!isFinite(nextPercent)) return;

    const nextTime = (nextPercent / 100) * mediaEl.duration;
    mediaEl.currentTime = nextTime;
    this.currentTime.set(nextTime);
    this.onUserInteraction();
  }

  onTimeUpdate(): void {
    const mediaEl = this.media?.nativeElement;
    if (!mediaEl) return;

    this.currentTime.set(mediaEl.currentTime || 0);
  }

  onUserInteraction(): void {
    const state = this.uiState();
    this.#markInteraction();

    if (state === 'playingControlsHidden') {
      // Any interaction while playing shows controls again
      this.uiState.set('playingControlsVisible');
    }

    if (state !== 'paused') {
      this.#restartAutoHideTimer();
    } else {
      this.#clearHideControlsTimer();
    }
  }

  onVideoClick(): void {
    // Delay to detect whether this was a double click
    if (this.clickTimeout) return;

    this.clickTimeout = setTimeout(() => {
      this.clickTimeout = undefined;
      this.#handlePrimaryTap(); // single click => play / pause
    }, this.CLICK_DELAY_MS);
  }

  onVideoDoubleClick(_event: MouseEvent): void {
    // double click: fullscreen / exit fullscreen
    if (this.clickTimeout) {
      clearTimeout(this.clickTimeout);
      this.clickTimeout = undefined;
    }

    this.toggleFullscreen();
  }

  removeVideo(): void {
    const mediaEl = this.media?.nativeElement;
    if (mediaEl) {
      if (!mediaEl.paused) {
        this.togglePlayPause();
      }
      mediaEl.currentTime = 0;
      mediaEl.removeAttribute('src');
      mediaEl.load();
    }

    this.uploadedUrl.set(null);
    this.#resetUiState();
  }

  seekBackward(): void {
    this.#seekBy(-this.SEEK_STEP_SECONDS);
  }

  seekForward(): void {
    this.#seekBy(this.SEEK_STEP_SECONDS);
  }

  toggleFullscreen(): void {
    const container = this.playerContainer?.nativeElement;
    if (!container) return;

    if (!document.fullscreenElement) {
      if (container.requestFullscreen) {
        container.requestFullscreen();
      }
      this.isFullscreen.set(true);
    } else if (document.fullscreenElement === container) {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
      this.isFullscreen.set(false);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
      this.isFullscreen.set(false);
    }

    this.onUserInteraction();
  }

  toggleMute(): void {
    const mediaEl = this.media?.nativeElement;
    if (!mediaEl) return;

    mediaEl.muted = !mediaEl.muted;
    this.onUserInteraction();
  }

  togglePlayPause(): void {
    const mediaEl = this.media?.nativeElement;
    if (!mediaEl) return;

    const shouldPlay = mediaEl.paused || this.isPaused();
    this.#markInteraction();

    if (shouldPlay) {
      // Start playback, show controls, then let the timer hide them
      this.uiState.set('playingControlsVisible');
      this.#restartAutoHideTimer();
      void mediaEl.play();
      return;
    }

    // Pause: keep overlay and controls visible, YouTube-style
    mediaEl.pause();
    this.uiState.set('paused');
    this.#clearHideControlsTimer();
  }

  #adjustVolume(delta: number): void {
    const mediaEl = this.media?.nativeElement;
    if (!mediaEl) return;

    const currentVolume = Number.isFinite(mediaEl.volume) ? mediaEl.volume : 1;
    const nextVolume = Math.min(1, Math.max(0, currentVolume + delta));
    mediaEl.volume = nextVolume;

    if (nextVolume > 0 && mediaEl.muted) {
      mediaEl.muted = false;
    }

    this.onUserInteraction();
  }

  #clearHideControlsTimer(): void {
    if (!this.hideControlsTimeout) return;

    clearTimeout(this.hideControlsTimeout);
    this.hideControlsTimeout = undefined;
  }

  #handlePrimaryTap(): void {
    // Single click on video => play/pause (desktop YouTube behavior)
    this.togglePlayPause();
  }

  #markInteraction(): number {
    const now = Date.now();
    this.lastInteractionTime.set(now);
    return now;
  }

  #processFile(file: File): void {
    if (!file.type.startsWith('video/')) return;

    this.uploadedUrl.set(URL.createObjectURL(file));
    this.videoUploaded.emit(file);
  }

  #resetUiState(): void {
    this.uiState.set('paused');
    this.currentTime.set(0);
    this.duration.set(0);
    this.lastInteractionTime.set(null);
    this.#clearHideControlsTimer();
  }

  #restartAutoHideTimer(): void {
    this.#clearHideControlsTimer();
    if (this.uiState() !== 'playingControlsVisible') return;

    const interactionToken = this.lastInteractionTime();
    this.hideControlsTimeout = setTimeout(() => {
      if (
        this.uiState() === 'playingControlsVisible' &&
        interactionToken === this.lastInteractionTime()
      ) {
        this.uiState.set('playingControlsHidden');
      }
    }, this.CONTROLS_AUTOHIDE_MS);
  }

  #seekBy(delta: number): void {
    const mediaEl = this.media?.nativeElement;
    if (!mediaEl || !isFinite(mediaEl.duration) || mediaEl.duration <= 0) return;

    const target = Math.min(
      mediaEl.duration,
      Math.max(0, mediaEl.currentTime + delta)
    );
    mediaEl.currentTime = target;
    this.#showSeekOverlay(delta >= 0 ? 'forward' : 'backward');
    this.onUserInteraction();
  }

  #showSeekOverlay(direction: SeekDirection): void {
    const token = ++this.seekOverlayToken;
    this.seekOverlay.set({ direction, token });

    if (this.hideSeekOverlayTimeout) {
      clearTimeout(this.hideSeekOverlayTimeout);
    }

    this.hideSeekOverlayTimeout = setTimeout(() => {
      const current = this.seekOverlay();
      if (current?.token === token) {
        this.seekOverlay.set(null);
      }
    }, 650);
  }
}

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
import { VgControlsModule } from '@videogular/ngx-videogular/controls';
import { VgCoreModule } from '@videogular/ngx-videogular/core';
import { VgOverlayPlayModule } from '@videogular/ngx-videogular/overlay-play';

@Component({
  selector: 'app-video-player',
  standalone: true,
  imports: [
    CommonModule,
    VgCoreModule,
    VgControlsModule,
    VgOverlayPlayModule,
    VgBufferingModule,
  ],
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
  readonly seekOverlay = signal<
    { direction: 'forward' | 'backward'; token: number } | null
  >(null);
  @ViewChild('media') media?: ElementRef<HTMLVideoElement>;
  private hideSeekOverlayTimeout?: ReturnType<typeof setTimeout>;
  private seekOverlayToken = 0;
  private clickTimeout?: ReturnType<typeof setTimeout>;
  private readonly SEEK_STEP_SECONDS = 10;
  private readonly CLICK_DELAY_MS = 250;
  private readonly SEEK_ZONE_RATIO = 0.25;
  private lastClickPlayState?: { wasPaused: boolean; timestamp: number };

  constructor() {
    effect((onCleanup) => {
      const url = this.uploadedUrl();
      if (!url) return;

      onCleanup(() => URL.revokeObjectURL(url));
    });
  }

  ngOnDestroy(): void {
    if (this.hideSeekOverlayTimeout) {
      clearTimeout(this.hideSeekOverlayTimeout);
    }
    if (this.clickTimeout) {
      clearTimeout(this.clickTimeout);
    }
  }

  onFileSelected(event: Event): void {
    const inputEl = event.target as HTMLInputElement;
    const file = inputEl.files?.[0];
    if (file) {
      this.processFile(file);
    }
    inputEl.value = '';
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

    const digit = Number(event.key);
    if (!Number.isInteger(digit) || digit < 0 || digit > 9) return;

    const mediaEl = this.media?.nativeElement;
    if (!mediaEl || !isFinite(mediaEl.duration) || mediaEl.duration <= 0) return;

    const fraction = digit / 10;
    mediaEl.currentTime = mediaEl.duration * fraction;
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver.set(true);
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver.set(false);
  }

  removeVideo(): void {
    const mediaEl = this.media?.nativeElement;
    if (mediaEl) {
      mediaEl.pause();
      mediaEl.currentTime = 0;
      mediaEl.removeAttribute('src');
      mediaEl.load();
    }

    this.uploadedUrl.set(null);
  }

  togglePlayPause(): void {
    const mediaEl = this.media?.nativeElement;
    if (!mediaEl) return;

    mediaEl.paused ? mediaEl.play() : mediaEl.pause();
  }

  toggleMute(): void {
    const mediaEl = this.media?.nativeElement;
    if (!mediaEl) return;

    mediaEl.muted = !mediaEl.muted;
  }

  onVideoClick(): void {
    if (this.clickTimeout) return;

    this.clickTimeout = setTimeout(() => {
      const mediaEl = this.media?.nativeElement;
      if (!mediaEl) {
        this.clickTimeout = undefined;
        return;
      }

      const wasPaused = mediaEl.paused;
      this.togglePlayPause();
      this.lastClickPlayState = { wasPaused, timestamp: Date.now() };
      this.clickTimeout = undefined;
    }, this.CLICK_DELAY_MS);
  }

  onVideoDoubleClick(event: MouseEvent): void {
    const mediaEl = this.media?.nativeElement;
    if (!mediaEl) return;

    if (this.clickTimeout) {
      clearTimeout(this.clickTimeout);
      this.clickTimeout = undefined;
    } else if (
      this.lastClickPlayState &&
      Date.now() - this.lastClickPlayState.timestamp < this.CLICK_DELAY_MS * 2
    ) {
      this.lastClickPlayState.wasPaused ? mediaEl.pause() : mediaEl.play();
    }
    this.lastClickPlayState = undefined;

    const rect = mediaEl.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const skipZoneWidth = rect.width * this.SEEK_ZONE_RATIO;

    if (clickX <= skipZoneWidth) {
      this.seekBackward();
      return;
    }

    if (clickX >= rect.width - skipZoneWidth) {
      this.seekForward();
    }
  }

  seekForward(): void {
    this.seekBy(this.SEEK_STEP_SECONDS);
  }

  seekBackward(): void {
    this.seekBy(-this.SEEK_STEP_SECONDS);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver.set(false);
    const file = event.dataTransfer?.files?.[0];
    if (!file || !file.type.startsWith('video/')) return;

    this.processFile(file);
  }

  private processFile(file: File): void {
    if (!file.type.startsWith('video/')) return;

    this.uploadedUrl.set(URL.createObjectURL(file));
    this.videoUploaded.emit(file);
  }

  private seekBy(delta: number): void {
    const mediaEl = this.media?.nativeElement;
    if (!mediaEl || !isFinite(mediaEl.duration) || mediaEl.duration <= 0) return;

    const target = Math.min(
      mediaEl.duration,
      Math.max(0, mediaEl.currentTime + delta)
    );
    mediaEl.currentTime = target;
    this.showSeekOverlay(delta >= 0 ? 'forward' : 'backward');
  }

  private showSeekOverlay(direction: 'forward' | 'backward'): void {
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

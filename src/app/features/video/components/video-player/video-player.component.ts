import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  HostListener,
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
export class VideoPlayerComponent {
  readonly videoUrl = input<string | null>(null);
  videoUploaded = output<File>();
  readonly uploadedUrl = signal<string | null>(null);
  readonly isDragOver = signal(false);
  readonly effectiveVideoUrl = computed(
    () => this.uploadedUrl() ?? this.videoUrl()
  );
  @ViewChild('media') media?: ElementRef<HTMLVideoElement>;

  constructor() {
    effect((onCleanup) => {
      const url = this.uploadedUrl();
      if (!url) return;

      onCleanup(() => URL.revokeObjectURL(url));
    });
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
}

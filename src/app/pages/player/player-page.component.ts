import {
  ChangeDetectionStrategy,
  Component,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { VideoPlayerComponent } from '../../features/video/components/video-player/video-player.component';

@Component({
  selector: 'app-player-page',
  standalone: true,
  imports: [CommonModule, VideoPlayerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './player-page.component.html',
})
export class PlayerPageComponent {
  selectedVideo = signal<File | undefined>(undefined);

  onVideoUploaded(video: File): void {
    this.selectedVideo.set(video);
  }
}

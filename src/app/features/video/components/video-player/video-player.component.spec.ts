import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { VideoPlayerComponent } from './video-player.component';

describe('VideoPlayerComponent', () => {
  let fixture: ComponentFixture<VideoPlayerComponent>;
  let component: VideoPlayerComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [VideoPlayerComponent],
    });

    fixture = TestBed.createComponent(VideoPlayerComponent);
    component = fixture.componentInstance;
  });

  it('renders the placeholder when no video source exists', () => {
    fixture.detectChanges();
    const placeholder = fixture.nativeElement.querySelector('button.border-dashed');

    expect(placeholder).toBeTruthy();
    expect(placeholder?.textContent).toContain('Drag & drop a video');
  });

  it('renders the player when a video url is provided', () => {
    fixture.componentRef.setInput('videoUrl', 'assets/test.mp4');
    fixture.detectChanges();

    const videoElement = fixture.nativeElement.querySelector('video') as HTMLVideoElement | null;
    expect(videoElement).toBeTruthy();
    expect(videoElement?.src).toContain('assets/test.mp4');
  });

  it('uses an uploaded file url and revokes previous object urls', () => {
    const createSpy = spyOn(URL, 'createObjectURL').and.returnValues('blob:first', 'blob:second');
    const revokeSpy = spyOn(URL, 'revokeObjectURL');

    triggerFileChange('video-1.mp4');
    fixture.detectChanges();
    expect(component.effectiveVideoUrl()).toBe('blob:first');

    triggerFileChange('video-2.mp4');
    fixture.detectChanges();

    expect(component.effectiveVideoUrl()).toBe('blob:second');
    expect(createSpy.calls.count()).toBe(2);
    expect(revokeSpy).toHaveBeenCalledWith('blob:first');

    function triggerFileChange(name: string): void {
      const file = new File(['video'], name, { type: 'video/mp4' });
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);

      const input = document.createElement('input');
      Object.defineProperty(input, 'files', { value: dataTransfer.files });

      component.onFileSelected({ target: input } as unknown as Event);
    }
  });

  it('removes the current video, clears the upload url and resets the ui state', () => {
    const videoElement = {
      paused: false,
      currentTime: 10,
      pause: jasmine.createSpy('pause'),
      load: jasmine.createSpy('load'),
      removeAttribute: jasmine.createSpy('removeAttribute'),
    } as unknown as HTMLVideoElement;

    component['uploadedUrl'].set('blob:temp');
    component.uiState.set('playingControlsVisible');
    component.lastInteractionTime.set(1000);

    component['media'] = { nativeElement: videoElement } as any;

    component.removeVideo();

    expect(videoElement.pause).toHaveBeenCalled();
    expect(videoElement.load).toHaveBeenCalled();
    expect(videoElement.currentTime).toBe(0);
    expect(component['uploadedUrl']()).toBeNull();
    expect(component.uiState()).toBe('paused');
    expect(component.lastInteractionTime()).toBeNull();
  });

  it('toggles playback with the space key and drives the ui state machine', fakeAsync(() => {
    let pausedState = true;
    const mediaEl = {
      get paused() {
        return pausedState;
      },
      play: jasmine.createSpy('play').and.callFake(() => {
        pausedState = false;
      }),
      pause: jasmine.createSpy('pause').and.callFake(() => {
        pausedState = true;
      }),
      duration: 120,
      currentTime: 0,
    } as unknown as HTMLVideoElement;

    component['media'] = { nativeElement: mediaEl } as any;

    const preventDefault = jasmine.createSpy('preventDefault');
    component.onKeydown({ code: 'Space', key: ' ', preventDefault } as unknown as KeyboardEvent);

    expect(mediaEl.play).toHaveBeenCalled();
    expect(component.uiState()).toBe('playingControlsVisible');

    tick((component as any).CONTROLS_AUTOHIDE_MS + 10);
    expect(component.uiState()).toBe('playingControlsHidden');

    component.onKeydown({ code: 'Space', key: ' ', preventDefault } as unknown as KeyboardEvent);
    expect(mediaEl.pause).toHaveBeenCalled();
    expect(component.uiState()).toBe('paused');
  }));

  it('shows and hides controls when tapping the video while playing', fakeAsync(() => {
    component.uiState.set('playingControlsHidden');
    component['media'] = { nativeElement: { paused: false } as HTMLVideoElement } as any;

    component.onVideoClick();
    tick((component as any).CLICK_DELAY_MS + 5);
    expect(component.uiState()).toBe('playingControlsVisible');

    component.onVideoClick();
    tick((component as any).CLICK_DELAY_MS + 5);
    expect(component.uiState()).toBe('playingControlsHidden');
  }));

  it('does not toggle playback when tapping the video while paused', fakeAsync(() => {
    let pausedState = true;
    const mediaEl = {
      get paused() {
        return pausedState;
      },
      play: jasmine.createSpy('play').and.callFake(() => {
        pausedState = false;
      }),
      pause: jasmine.createSpy('pause').and.callFake(() => {
        pausedState = true;
      }),
    } as unknown as HTMLVideoElement;

    component['media'] = { nativeElement: mediaEl } as any;
    component.uiState.set('paused');

    component.onVideoClick();
    tick((component as any).CLICK_DELAY_MS + 5);

    expect(mediaEl.play).not.toHaveBeenCalled();
    expect(mediaEl.pause).not.toHaveBeenCalled();
    expect(component.uiState()).toBe('paused');
    expect(component.controlsAreVisible()).toBeTrue();
  }));

  it('updates the current time when scrubbing the progress bar', () => {
    const mediaEl = { duration: 200, currentTime: 0 } as HTMLVideoElement;
    component['media'] = { nativeElement: mediaEl } as any;

    component.onScrubInput({ target: { value: '50' } } as unknown as Event);

    expect(mediaEl.currentTime).toBeCloseTo(100);
    expect(component.currentTime()).toBeCloseTo(100);
    expect(component.lastInteractionTime()).not.toBeNull();
  });
});

import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { VideoPlayerComponent } from './video-player.component';

describe('VideoPlayerComponent', () => {
  let fixture: ComponentFixture<VideoPlayerComponent>;
  let component: VideoPlayerComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [VideoPlayerComponent]
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

  it('removes the current video and clears the upload url', () => {
    fixture.componentRef.setInput('videoUrl', 'assets/test.mp4');
    fixture.detectChanges();

    const videoElement = fixture.nativeElement.querySelector('video') as HTMLVideoElement;
    component['uploadedUrl'].set('blob:temp');

    const pauseSpy = spyOn(videoElement, 'pause').and.callThrough();
    const loadSpy = spyOn(videoElement, 'load').and.callThrough();

    component.removeVideo();

    expect(pauseSpy).toHaveBeenCalled();
    expect(loadSpy).toHaveBeenCalled();
    expect(videoElement.currentTime).toBe(0);
    expect(component['uploadedUrl']()).toBeNull();
  });

  it('toggles play and pause with the space key when focused outside inputs', () => {
    let pausedState = true;
    const playSpy = jasmine.createSpy('play').and.callFake(() => {
      pausedState = false;
    });
    const pauseSpy = jasmine.createSpy('pause').and.callFake(() => {
      pausedState = true;
    });

    component['media'] = {
      nativeElement: {
        get paused() {
          return pausedState;
        },
        play: playSpy,
        pause: pauseSpy,
      } as unknown as HTMLVideoElement,
    } as any;

    const preventDefault = jasmine.createSpy('preventDefault');

    // Start paused; pressing space should play
    component.onKeydown(
      new KeyboardEvent('keydown', {
        code: 'Space',
        key: ' ',
        bubbles: true,
        cancelable: true,
      }) as any
    );
    expect(playSpy).toHaveBeenCalled();
    expect(pausedState).toBeFalse();

    // Now playing; pressing space should pause
    component.onKeydown({ code: 'Space', key: ' ', preventDefault } as unknown as KeyboardEvent);
    expect(pauseSpy).toHaveBeenCalled();
    expect(preventDefault).toHaveBeenCalled();
    expect(pausedState).toBeTrue();
  });

  it('toggles play/pause on single click only after the delay window', fakeAsync(() => {
    const clickDelay = (component as any).CLICK_DELAY_MS ?? 250;
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
    } as any as HTMLVideoElement;

    component['media'] = { nativeElement: mediaEl } as any;

    component.onVideoClick();
    tick(clickDelay - 1);
    expect(mediaEl.play).not.toHaveBeenCalled();

    tick(1);
    expect(mediaEl.play).toHaveBeenCalledTimes(1);
    expect(pausedState).toBeFalse();
  }));

  it('seeks forward on right-side double click without toggling play/pause', fakeAsync(() => {
    const clickDelay = (component as any).CLICK_DELAY_MS ?? 250;
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
      getBoundingClientRect: () =>
        ({
          left: 0,
          width: 100,
        }) as DOMRect,
    } as any as HTMLVideoElement;

    component['media'] = { nativeElement: mediaEl } as any;

    const forwardSpy = spyOn(component, 'seekForward');
    const toggleSpy = spyOn(component, 'togglePlayPause').and.callThrough();

    component.onVideoClick();
    component.onVideoDoubleClick(new MouseEvent('dblclick', { clientX: 90 }));

    tick(clickDelay + 20);

    expect(forwardSpy).toHaveBeenCalledTimes(1);
    expect(toggleSpy).not.toHaveBeenCalled();
    expect(mediaEl.play).not.toHaveBeenCalled();
    expect(mediaEl.pause).not.toHaveBeenCalled();
  }));

  it('reverts a single-click toggle when the second click arrives late but in a skip zone', fakeAsync(() => {
    const clickDelay = (component as any).CLICK_DELAY_MS ?? 250;
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
      getBoundingClientRect: () =>
        ({
          left: 0,
          width: 100,
        }) as DOMRect,
    } as any as HTMLVideoElement;

    component['media'] = { nativeElement: mediaEl } as any;

    const backwardSpy = spyOn(component, 'seekBackward');

    component.onVideoClick();
    tick(clickDelay + 10);

    expect(mediaEl.play).toHaveBeenCalled();
    expect(pausedState).toBeFalse();

    component.onVideoDoubleClick({ clientX: 5 } as MouseEvent);

    expect(backwardSpy).toHaveBeenCalledTimes(1);
    expect(mediaEl.pause).toHaveBeenCalled();
    expect(pausedState).toBeTrue();
  }));
});

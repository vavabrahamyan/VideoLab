import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PlayerPageComponent } from './player-page.component';

describe('PlayerPageComponent', () => {
  let fixture: ComponentFixture<PlayerPageComponent>;
  let component: PlayerPageComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [PlayerPageComponent]
    });

    fixture = TestBed.createComponent(PlayerPageComponent);
    component = fixture.componentInstance;
  });

  it('shows the playlist count and default selection', () => {
    fixture.detectChanges();

    const heading = fixture.nativeElement.querySelector('h1');
    expect(heading?.textContent).toContain('Select a video');
  });

  it('updates the heading when a video is uploaded', () => {
    fixture.detectChanges();

    const uploadedFile = new File(['video'], 'my-upload.mp4', { type: 'video/mp4' });
    component.onVideoUploaded(uploadedFile);
    fixture.detectChanges();

    const heading = fixture.nativeElement.querySelector('h1');
    expect(heading?.textContent).toContain('my-upload.mp4');
  });
});

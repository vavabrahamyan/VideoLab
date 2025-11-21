import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NotFoundPageComponent } from './not-found-page.component';

describe('NotFoundPageComponent', () => {
  let fixture: ComponentFixture<NotFoundPageComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [NotFoundPageComponent],
      providers: [provideRouter([])]
    });

    fixture = TestBed.createComponent(NotFoundPageComponent);
  });

  it('renders the not found copy and layout classes', () => {
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.classList).toContain('min-h-screen');
    expect(host.textContent).toContain('Page not found');
  });

  it('links back to the player route', () => {
    fixture.detectChanges();

    const cta = fixture.nativeElement.querySelector('a[routerLink="/player"]') as HTMLAnchorElement | null;
    expect(cta).toBeTruthy();
    expect(cta?.textContent?.trim()).toBe('Back to player');
  });
});

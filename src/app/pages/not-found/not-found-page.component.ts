import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-not-found-page',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'flex min-h-screen flex-col items-center justify-center bg-slate-950 px-6 text-center text-slate-50'
  },
  templateUrl: './not-found-page.component.html'
})
export class NotFoundPageComponent {}

import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    redirectTo: '/player',
    pathMatch: 'full'
  },
  {
    path: 'player',
    loadComponent: () =>
      import('./pages/player/player-page.component').then(c => c.PlayerPageComponent)
  },
  {
    path: '**',
    loadComponent: () =>
      import('./pages/not-found/not-found-page.component').then(c => c.NotFoundPageComponent)
  }
];

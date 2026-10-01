import { Routes } from '@angular/router';
import { Login } from './pages/login';
import { Shell } from './layout/shell';
import { Repertorio } from './pages/repertorio';
import { authGuard } from './core/auth.guard';

export const routes: Routes = [
  { path: 'login', component: Login },
  {
    path: '', component: Shell, canActivate: [authGuard], children: [
      { path: '', pathMatch: 'full', redirectTo: 'repertorio' },
      { path: 'repertorio', component: Repertorio },
      { path: 'repertorio/:id', loadComponent: () => import('./pages/cancion').then(m => m.Cancion) },
      { path: 'administracion', pathMatch: 'full', redirectTo: 'administracion/canciones' },
      { path: 'administracion/canciones', loadComponent: () => import('./pages/canciones-admin').then(m => m.CancionesAdmin) },
      { path: 'administracion/canciones/nueva', loadComponent: () => import('./pages/cancion-form').then(m => m.CancionForm) },
      { path: 'administracion/canciones/:id', loadComponent: () => import('./pages/cancion-form').then(m => m.CancionForm) },
      { path: 'administracion/estudio', loadComponent: () => import('./pages/estudio').then(m => m.Estudio) },
      { path: 'administracion/estudio/nueva', loadComponent: () => import('./pages/estudio-form').then(m => m.EstudioForm) },
      { path: 'administracion/estudio/:id/parte/:pos', loadComponent: () => import('./pages/estudio-parte').then(m => m.EstudioParte) },
      { path: 'administracion/estudio/:id', loadComponent: () => import('./pages/estudio-form').then(m => m.EstudioForm) },
    ],
  },
  { path: '**', redirectTo: '' },
];

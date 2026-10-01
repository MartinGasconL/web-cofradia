import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { tap } from 'rxjs';
import { environment } from '../../environments/environment';

interface InfoResponse { content: string; updatedAt: string | null }

/** Contenido Markdown de la sección Información (un único documento compartido). */
@Injectable({ providedIn: 'root' })
export class InfoService {
  private http = inject(HttpClient);
  private readonly url = `${environment.apiBaseUrl}/api/v1/info`;

  readonly content = signal('');
  readonly updatedAt = signal<string | null>(null);
  readonly loaded = signal(false);

  load() {
    return this.http.get<InfoResponse>(this.url).pipe(tap(r => this.apply(r)));
  }

  save(content: string) {
    return this.http.put<InfoResponse>(this.url, { content }).pipe(tap(r => this.apply(r)));
  }

  private apply(r: InfoResponse) {
    this.content.set(r.content);
    this.updatedAt.set(r.updatedAt);
    this.loaded.set(true);
  }
}

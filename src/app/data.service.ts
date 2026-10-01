import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, tap, Observable } from 'rxjs';
import { environment } from '../environments/environment';

export const TRACKS = ['tambor', 'bombo', 'bombo_desfase1', 'bombo_desfase2', 'completa'] as const;
export type Track = typeof TRACKS[number];

export const TRACK_LABEL: Record<Track, string> = {
  tambor: 'Tambor',
  bombo: 'Bombo',
  bombo_desfase1: 'Bombo · desfase 1',
  bombo_desfase2: 'Bombo · desfase 2',
  completa: 'Todos juntos',
};

export const TRACK_SHORT: Record<Track, string> = {
  tambor: 'Tambor',
  bombo: 'Bombo',
  bombo_desfase1: 'Desf. 1',
  bombo_desfase2: 'Desf. 2',
  completa: 'Todos',
};

export type TrackStatus = 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED';

export interface TrackInfo {
  type: Track;
  filename: string;
  status: TrackStatus;
  duration: number | null;
  version: number;
}

/** Una pista que toca en una parte, con su propio fragmento temporal. */
export interface ParteTrack {
  track: Track;
  start: number;
  end: number;
}

export interface Parte {
  name: string;
  note: string;
  start: number;
  end: number;
  color: string;
  tracks: ParteTrack[];
  question?: boolean;
  answer?: boolean;
  /** Indicativo explícito que marca el usuario: en esta parte hay desfase de bombos. */
  desfase?: boolean;
}

/** Rama alternativa: bifurca tras la parte principal `desde` y reconcilia en la parte `hasta`. */
export interface Rama {
  id: string;
  nombre: string;
  desde: number; // índice en song.partes tras el que bifurca
  hasta: number; // índice en song.partes en el que reconcilia (la rama sustituye partes[desde+1 .. hasta-1])
  activa: boolean; // true = la canción sigue esta rama; false = sigue la línea principal (la rama queda guardada)
  partes: Parte[];
}

export interface Song {
  id: number;
  title: string;
  description: string;
  procesion: boolean;
  exhibicion: boolean;
  qa: boolean;
  bpm: number;
  duration: number;
  draft: boolean;
  /** Información de la canción en Markdown (imágenes, vídeo y audio incrustables). */
  info: string;
  tracks: Partial<Record<Track, TrackInfo>>;
  partes: Parte[];
  ramas: Rama[];
}

type ApiTrack = { id: number; type: string; originalFilename: string; status: TrackStatus; durationSeconds: number | null; version: number };
type ApiSectionTrack = { type: string; startSeconds: number; endSeconds: number };
type ApiSection = { title: string; note: string; startSeconds: number; endSeconds: number; color: string; question: boolean; answer: boolean; desfase: boolean; branchKey: string | null; branchFrom: number | null; branchTo: number | null; branchActive: boolean; tracks: ApiSectionTrack[] };
type ApiSong = {
  id: number; title: string; description: string; bpm: number; durationSeconds: number;
  procession: boolean; exhibition: boolean; draft: boolean; info: string | null; tracks: ApiTrack[]; sections: ApiSection[];
};

@Injectable({ providedIn: 'root' })
export class DataService {
  private readonly base = `${environment.apiBaseUrl}/api/v1/songs`;
  readonly songs = signal<Song[]>([]);

  constructor(private http: HttpClient) {}

  load() {
    return this.http.get<ApiSong[]>(this.base).pipe(
      map(rows => rows.map(row => this.fromApi(row))),
      tap(rows => this.songs.set(rows)),
    );
  }

  /** Recarga una sola canción y la fusiona en el signal (para refrescar estados de audio). */
  refresh(id: number): Observable<Song> {
    return this.http.get<ApiSong>(`${this.base}/${id}`).pipe(
      map(row => this.fromApi(row)),
      tap(song => this.songs.update(rows => {
        const found = rows.some(s => s.id === song.id);
        return found ? rows.map(s => (s.id === song.id ? song : s)) : [...rows, song];
      })),
    );
  }

  find(id: number) {
    return this.songs().find(x => x.id === id);
  }

  create(song: Omit<Song, 'id'>) {
    return this.http.post<ApiSong>(this.base, this.toRequest(song)).pipe(
      map(row => this.fromApi(row)),
      tap(row => this.songs.update(rows => [...rows, row])),
    );
  }

  update(song: Song) {
    return this.http.put<ApiSong>(`${this.base}/${song.id}`, this.toRequest(song)).pipe(
      map(row => this.fromApi(row)),
      tap(row => this.songs.update(rows => rows.map(existing => (existing.id === row.id ? row : existing)))),
    );
  }

  /** Borra una canción. Los borradores se borran de verdad; las oficiales, lógicamente (backend). */
  remove(id: number) {
    return this.http.delete<void>(`${this.base}/${id}`).pipe(
      tap(() => this.songs.update(rows => rows.filter(s => s.id !== id))),
    );
  }

  /** Sube (o reemplaza) el audio de una pista. Acepta File o Blob (grabación del navegador). */
  uploadTrack(songId: number, track: Track, data: Blob, filename: string) {
    const body = new FormData();
    body.append('file', data, filename);
    return this.http.post<ApiTrack>(`${this.base}/${songId}/tracks/${track.toUpperCase()}`, body);
  }

  /** Sube una imagen, vídeo o audio para incrustarlo en la información de la canción. Devuelve la URL a usar en el Markdown. */
  uploadInfoMedia(songId: number, file: File) {
    const body = new FormData();
    body.append('file', file, file.name);
    return this.http.post<{ url: string; kind: 'image' | 'video' | 'audio'; name: string }>(`${this.base}/${songId}/info-media`, body);
  }

  /** URL de streaming de una pista (con soporte de Range en el backend). */
  audioUrl(songId: number, track: Track) {
    return `${this.base}/${songId}/tracks/${track.toUpperCase()}/audio`;
  }

  private fromApi(row: ApiSong): Song {
    const tracks: Partial<Record<Track, TrackInfo>> = {};
    for (const t of row.tracks) {
      const key = t.type.toLowerCase() as Track;
      tracks[key] = {
        type: key,
        filename: t.originalFilename,
        status: t.status,
        duration: t.durationSeconds,
        version: t.version,
      };
    }
    const parte = (s: ApiSection): Parte => ({
      name: s.title,
      note: s.note || '',
      start: s.startSeconds,
      end: s.endSeconds,
      color: s.color,
      question: s.question,
      answer: s.answer,
      desfase: s.desfase,
      tracks: s.tracks.map(t => ({ track: t.type.toLowerCase() as Track, start: t.startSeconds, end: t.endSeconds })),
    });

    const ramas = new Map<string, Rama>();
    for (const s of row.sections) {
      if (!s.branchKey) continue;
      let r = ramas.get(s.branchKey);
      if (!r) { r = { id: s.branchKey, nombre: `Rama ${ramas.size + 1}`, desde: s.branchFrom ?? 0, hasta: s.branchTo ?? 0, activa: s.branchActive ?? true, partes: [] }; ramas.set(s.branchKey, r); }
      r.partes.push(parte(s));
    }

    return {
      id: row.id,
      title: row.title,
      description: row.description || '',
      bpm: row.bpm,
      duration: row.durationSeconds,
      procesion: row.procession,
      exhibicion: row.exhibition,
      qa: row.sections.some(s => s.question || s.answer),
      draft: row.draft,
      info: row.info || '',
      tracks,
      partes: row.sections.filter(s => !s.branchKey).map(parte),
      ramas: [...ramas.values()],
    };
  }

  private toRequest(song: Omit<Song, 'id'> | Song) {
    const section = (p: Parte, branchKey: string | null, from: number | null, to: number | null, active: boolean) => ({
      title: p.name,
      note: p.note,
      startSeconds: p.start,
      endSeconds: p.end,
      color: p.color,
      question: !!p.question,
      answer: !!p.answer,
      desfase: !!p.desfase,
      branchKey,
      branchFrom: from,
      branchTo: to,
      branchActive: active,
      tracks: p.tracks.map(t => ({ type: t.track.toUpperCase(), startSeconds: t.start, endSeconds: t.end })),
    });
    return {
      title: song.title,
      description: song.description,
      bpm: song.bpm,
      durationSeconds: song.duration,
      procession: song.procesion,
      exhibition: song.exhibicion,
      draft: song.draft ?? false,
      info: song.info ?? '',
      sections: [
        ...song.partes.map(p => section(p, null, null, null, true)),
        ...(song.ramas ?? []).flatMap(r => r.partes.map(p => section(p, r.id, r.desde, r.hasta, r.activa !== false))),
      ],
    };
  }
}

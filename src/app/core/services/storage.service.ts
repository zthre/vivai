import { Injectable, inject } from '@angular/core';
import {
  Storage,
  ref as storageRef,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
} from '@angular/fire/storage';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class StorageService {
  private storage = inject(Storage);

  uploadFile(storagePath: string, file: File): Observable<number> {
    const ref = storageRef(this.storage, storagePath);
    const task = uploadBytesResumable(ref, file);
    return new Observable(obs =>
      task.on(
        'state_changed',
        snap => obs.next((snap.bytesTransferred / snap.totalBytes) * 100),
        err => obs.error(err),
        () => obs.complete()
      )
    );
  }

  async getDownloadURL(storagePath: string): Promise<string> {
    const ref = storageRef(this.storage, storagePath);
    return getDownloadURL(ref);
  }

  async deleteFile(storagePath: string): Promise<void> {
    const ref = storageRef(this.storage, storagePath);
    await deleteObject(ref);
  }
}

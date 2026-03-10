import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface UploadItem {
  name: string;
  progress: () => number;
}

@Component({
  selector: 'app-photo-upload',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="space-y-2">
      @for (item of queue(); track item.name) {
        <div class="flex items-center gap-3 bg-warm-50 rounded-lg px-3 py-2">
          <div class="flex-1 min-w-0">
            <p class="text-xs text-warm-700 font-medium truncate">{{ item.name }}</p>
            <div class="mt-1 h-1.5 bg-warm-200 rounded-full overflow-hidden">
              <div
                class="h-full bg-primary-500 rounded-full transition-all duration-200"
                [style.width.%]="item.progress()"
              ></div>
            </div>
          </div>
          <span class="text-xs text-warm-500 flex-shrink-0 w-8 text-right">
            {{ item.progress() | number:'1.0-0' }}%
          </span>
        </div>
      }
    </div>
  `,
})
export class PhotoUploadComponent {
  queue = input.required<UploadItem[]>();
}

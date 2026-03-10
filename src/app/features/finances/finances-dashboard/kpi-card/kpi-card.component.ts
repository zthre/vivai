import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';

export type KpiVariant = 'neutral' | 'positive' | 'negative';

@Component({
  selector: 'app-kpi-card',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="bg-white rounded-xl p-5 border border-warm-200 shadow-sm">
      <p class="text-sm font-medium text-warm-500 mb-1">{{ label() }}</p>
      <p
        class="text-2xl font-bold"
        [class.text-warm-900]="variant() === 'neutral'"
        [class.text-green-600]="variant() === 'positive'"
        [class.text-red-600]="variant() === 'negative'"
      >
        {{ amount() | currency:'COP':'symbol-narrow':'1.0-0' }}
      </p>
    </div>
  `,
})
export class KpiCardComponent {
  label = input.required<string>();
  amount = input.required<number>();
  variant = input<KpiVariant>('neutral');
}

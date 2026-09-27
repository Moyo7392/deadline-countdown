import { ChangeDetectionStrategy, Component } from '@angular/core';
import { DeadlineComponent } from './deadline.component';

@Component({
  selector: 'app-root',
  imports: [DeadlineComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<main><h1>Deadline countdown</h1><app-deadline /></main>',
})
export class App {}

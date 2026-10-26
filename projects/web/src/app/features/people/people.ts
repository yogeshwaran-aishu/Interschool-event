import { Component, computed, inject, signal } from '@angular/core';
import {
  DsBadge,
  DsButton,
  DsControl,
  DsDialog,
  DsEmptyState,
  DsField,
  DsIcon,
  DsPageHeader,
} from '@isc/design-system';
import { Auth } from '../../core/auth';
import {
  IMPORT_COLUMNS,
  IMPORT_TEMPLATE,
  ImportRowError,
  PersonImportRow,
  validatePeopleCsv,
} from '../../core/csv';
import { DomainService } from '../../core/domain';
import { Exporter } from '../../core/export';
import { injectAction } from '../../shared/action';

type Tab = 'students' | 'teachers';

@Component({
  selector: 'app-people',
  imports: [DsPageHeader, DsButton, DsIcon, DsBadge, DsDialog, DsField, DsControl, DsEmptyState],
  templateUrl: './people.html',
})
export default class People {
  private readonly auth = inject(Auth);
  private readonly domain = inject(DomainService);
  private readonly exporter = inject(Exporter);
  private readonly run = injectAction();
  protected readonly columns = IMPORT_COLUMNS;

  protected readonly tab = signal<Tab>('students');
  protected readonly query = signal('');

  protected readonly students = computed(() => {
    const me = this.auth.user();
    const q = this.query().trim().toLowerCase();
    return this.domain.db.users
      .filter((u) => u.schoolId === me?.schoolId && u.role === 'student')
      .map((u) => ({ user: u, profile: this.domain.profile(u.id) }))
      .filter((x) => !q || `${x.user.name} ${x.profile?.admissionNo}`.toLowerCase().includes(q))
      .sort(
        (a, b) =>
          (a.profile?.className ?? 0) - (b.profile?.className ?? 0) ||
          a.user.name.localeCompare(b.user.name),
      );
  });
  protected readonly teachers = computed(() => {
    const me = this.auth.user();
    const q = this.query().trim().toLowerCase();
    return this.domain.db.users
      .filter((u) => u.schoolId === me?.schoolId && u.role === 'teacher')
      .filter((u) => !q || u.name.toLowerCase().includes(q));
  });

  // Import dialog state.
  protected readonly importOpen = signal(false);
  protected readonly csvText = signal('');
  protected readonly fileName = signal<string | null>(null);
  protected readonly report = signal<{ valid: PersonImportRow[]; errors: ImportRowError[] } | null>(
    null,
  );

  protected selectTab(tab: Tab): void {
    this.tab.set(tab);
  }

  protected onTabKey(event: KeyboardEvent): void {
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      const next: Tab = this.tab() === 'students' ? 'teachers' : 'students';
      this.tab.set(next);
      (event.currentTarget as HTMLElement).parentElement
        ?.querySelector<HTMLElement>(`#tab-${next}`)
        ?.focus();
    }
  }

  protected openImport(): void {
    this.csvText.set('');
    this.fileName.set(null);
    this.report.set(null);
    this.importOpen.set(true);
  }

  protected async onFile(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.fileName.set(file.name);
    this.csvText.set(await file.text());
    this.check();
  }

  protected check(): void {
    const db = this.domain.db;
    const emails = new Set(db.users.map((u) => u.email.toLowerCase()));
    const admissions = new Set(db.students.map((s) => s.admissionNo));
    this.report.set(validatePeopleCsv(this.csvText(), emails, admissions));
  }

  protected importValid(): void {
    const rows = this.report()?.valid ?? [];
    if (!rows.length) return;
    const errors = this.report()?.errors.length ?? 0;
    const ok = this.run(
      () => this.domain.importPeople(rows),
      (n) => `${n} ${n === 1 ? 'person' : 'people'} imported`,
      errors
        ? `${errors} row(s) were skipped — fix them and import again.`
        : 'Each person receives sign-in details and must change their password on first login.',
    );
    if (ok) this.importOpen.set(false);
  }

  protected downloadTemplate(): void {
    const rows = IMPORT_TEMPLATE.split('\r\n').map((line) => line.split(','));
    this.exporter.downloadCsv('people-import-template.csv', rows);
  }

  protected toggleHosting(teacherId: string, canHost: boolean): void {
    this.run(
      () => this.domain.setTeacherCanHost(teacherId, canHost),
      canHost ? 'Teacher can now create events' : 'Event creation turned off',
    );
  }
}

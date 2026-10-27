import { IDS, expect, test, USERS, signIn, switchUser } from './support';

/**
 * The PRD core flow, end to end: host creates and publishes an event, invites a school;
 * the guest school accepts; a student applies; the guest school approves and submits;
 * the host confirms and exports.
 */
test('host → guest school → student → approval → host confirmation', async ({ page }) => {
  // Host creates an event (EV-1, EV-2).
  await signIn(page, USERS.hostAdmin);
  await page.goto('/events/new');
  await page.getByLabel('Title').fill('Inter-School Chess Open');
  await page.getByLabel('Venue').fill('Sunrise Library');
  await page.getByLabel('Event starts').fill('2027-01-20T09:00');
  await page.getByLabel('Registration deadline').fill('2027-01-10T18:00');
  await page.getByLabel(/^\s*Name/).fill('Under 16');
  await page.getByLabel('Lowest class').fill('8');
  await page.getByLabel('Highest class').fill('10');
  await page.getByLabel('Max entries per school').fill('1');
  await page.getByRole('button', { name: 'Publish event' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Inter-School Chess Open' }),
  ).toBeVisible();
  await expect(page.getByText('Event published')).toBeVisible();

  // Invite Lakeview (IN-1).
  await page.getByRole('button', { name: 'Invite schools' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Invite schools' });
  await dialog.getByRole('checkbox', { name: /Lakeview Vidyalaya/ }).check();
  await dialog.getByRole('button', { name: /Send 1 invitation/ }).click();
  await expect(page.getByRole('cell', { name: 'Lakeview Vidyalaya', exact: true })).toBeVisible();

  // Guest school accepts (IN-2).
  await switchUser(page, USERS.guestAdmin);
  await page.goto('/invitations');
  await page.getByRole('button', { name: 'Accept Inter-School Chess Open' }).click();
  await page.getByLabel('Note to the host (optional)').fill('Sending our best player.');
  await page.getByRole('button', { name: 'Accept invitation' }).click();
  await expect(page.getByText('Accepted: Inter-School Chess Open')).toBeVisible();

  // Two eligible students apply (RG-1).
  await switchUser(page, USERS.student);
  await page.goto('/explore');
  await page.getByRole('button', { name: 'Apply for Under 16' }).click();
  await expect(page.getByText('Applied for Under 16')).toBeVisible();

  await switchUser(page, 'kabir@lakeview.test');
  await page.goto('/explore');
  await page.getByRole('button', { name: 'Apply for Under 16' }).click();

  // School approves within quota (RG-3) and submits (RG-4).
  await switchUser(page, USERS.guestAdmin);
  await page.goto('/approvals');
  await page.getByRole('link', { name: 'Inter-School Chess Open' }).click();
  await page.getByRole('button', { name: 'Approve Aarav Mehta' }).click();
  await expect(page.getByRole('meter', { name: 'Approved against limit' }).first()).toHaveAttribute(
    'aria-valuetext',
    '1 of 1',
  );
  // Quota is full: the button is announced as unavailable, and pressing it explains why.
  const approveKabir = page.getByRole('button', { name: 'Approve Kabir Nair' });
  await expect(approveKabir).toBeDisabled();
  await approveKabir.click({ force: true });
  await expect(page.getByText(/Quota reached/)).toBeVisible();

  await page.getByRole('button', { name: /Send 1 to host/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Send to host' }).click();
  await expect(page.getByText('1 nomination(s) sent to the host')).toBeVisible();

  // Host confirms (RG-5) and can export (RP-1).
  await switchUser(page, USERS.hostAdmin);
  await page.goto('/events');
  await page.getByRole('link', { name: 'Inter-School Chess Open' }).click();
  await page.getByRole('link', { name: /Nominations/ }).click();
  await expect(page.getByRole('cell', { name: 'Aarav Mehta', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Confirm Aarav Mehta' }).click();
  await expect(page.getByRole('row', { name: /Aarav Mehta/ }).getByText('Confirmed')).toBeVisible();

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /Export CSV/ }).click();
  expect((await download).suggestedFilename()).toBe('inter-school-chess-open-participants.csv');

  // Student sees the confirmation.
  await switchUser(page, USERS.student);
  await page.goto('/my-applications');
  await expect(
    page.getByRole('row', { name: /Inter-School Chess Open/ }).getByText('Confirmed'),
  ).toBeVisible();
});

test('host cancels an event with a reason (EV-5)', async ({ page }) => {
  await signIn(page, USERS.hostAdmin);
  await page.goto(`/events/${IDS.fiesta}`);
  await page.getByRole('button', { name: 'Cancel event' }).click();
  const dialog = page.getByRole('dialog', { name: 'Cancel this event?' });
  await dialog.getByRole('button', { name: 'Cancel event' }).click();
  await expect(dialog.getByText('Give a reason')).toBeVisible();
  await dialog.getByLabel('Reason').fill('Exam schedule moved');
  await dialog.getByRole('button', { name: 'Cancel event' }).click();
  await expect(page.getByText('Cancelled.')).toBeVisible();

  await switchUser(page, USERS.guestAdmin);
  await page.goto('/notifications');
  await expect(page.getByText(/Inter-School Science Fiesta 2026 has been cancelled/)).toBeVisible();
});

test('app admin onboards a school (ON-1) and imports via CSV (ON-2)', async ({ page }) => {
  await signIn(page, USERS.appAdmin);
  await page.goto('/schools');
  await page.getByRole('button', { name: 'Onboard a school' }).click();
  const dialog = page.getByRole('dialog', { name: 'Onboard a school' });
  await dialog.getByLabel('School name').fill('Hilltop School');
  await dialog.getByLabel('City').fill('Pune');
  await dialog.getByLabel('Address').fill('1 Hill Road');
  await dialog.getByLabel('Office email').fill('office@hilltop.test');
  await dialog.getByLabel('Office phone').fill('+91 20 1111 2222');
  await dialog.getByLabel('School Admin name').fill('Hema Rao');
  await dialog.getByLabel('School Admin email').fill('hema@hilltop.test');
  await dialog.getByRole('button', { name: 'Create school' }).click();
  await expect(page.getByText('Hilltop School onboarded')).toBeVisible();

  // New admin signs in, must set a password, then imports people.
  await switchUser(page, 'hema@hilltop.test');
  await expect(page).toHaveURL(/\/account\/password/);
  await page.getByLabel('Current password').fill('demo1234');
  await page.getByLabel(/^\s*New password/).fill('hilltop-pass-1');
  await page.getByLabel('Confirm new password').fill('hilltop-pass-1');
  await page.getByRole('button', { name: 'Save password' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Hello, Hema' })).toBeVisible();

  await page.goto('/people');
  await page.getByRole('button', { name: /Import CSV/ }).click();
  const importDialog = page.getByRole('dialog', { name: 'Import people' });
  await importDialog
    .getByLabel('Or paste CSV text')
    .fill(
      [
        'role,name,email,phone,class,section,admission_no,gender,guardian_name,guardian_contact,consent',
        'student,Riya Sen,riya@hilltop.test,,9,A,HT-1,female,Mala Sen,mala@example.test,yes',
        'student,No Class,nc@hilltop.test,,,A,HT-2,male,G,g@example.test,yes',
      ].join('\n'),
    );
  await importDialog.getByRole('button', { name: 'Check rows' }).click();
  await expect(importDialog.getByText('1 ready')).toBeVisible();
  await expect(importDialog.getByText('Class must be a whole number from 1 to 12.')).toBeVisible();
  await importDialog.getByRole('button', { name: 'Import 1 valid row(s)' }).click();
  await expect(page.getByRole('cell', { name: 'Riya Sen', exact: true })).toBeVisible();
});

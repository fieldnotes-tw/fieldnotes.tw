function formatSeenDateInput(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const copy = new Date(d);
  copy.setMinutes(copy.getMinutes() - copy.getTimezoneOffset());
  return copy.toISOString().slice(0, 10);
}

function formatSeenTimeInput(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const copy = new Date(d);
  copy.setMinutes(copy.getMinutes() - copy.getTimezoneOffset());
  return copy.toISOString().slice(11, 16);
}

function combineSeenDateTime(dateValue, timeValue) {
  if (!dateValue) return null;
  const [hour = '12', minute = '00'] = (timeValue || '12:00').split(':');
  const parsed = new Date(`${dateValue}T${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function setDefaultSeenDateTime(dateInput, timeInput, { force = false } = {}) {
  if (!dateInput || !timeInput) return;
  if (!force && dateInput.dataset.seenConfigured === '1') return;

  const now = new Date();
  dateInput.value = formatSeenDateInput(now);
  timeInput.value = formatSeenTimeInput(now);
  dateInput.dataset.seenConfigured = '1';
}

function setSeenDateTimeInputs(dateInput, timeInput, value) {
  if (!dateInput || !timeInput) return;
  const d = value instanceof Date ? value : new Date(value);
  dateInput.value = formatSeenDateInput(d);
  timeInput.value = formatSeenTimeInput(d);
  dateInput.dataset.seenConfigured = '1';
}

function seenDateTimeIso(dateInput, timeInput) {
  const parsed = combineSeenDateTime(dateInput?.value, timeInput?.value);
  return parsed ? parsed.toISOString() : '';
}

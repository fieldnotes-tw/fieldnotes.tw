function initSeenTimeSelects(hourSelect, minuteSelect) {
  if (!hourSelect || !minuteSelect || hourSelect.options.length) return;

  for (let h = 0; h < 24; h += 1) {
    const value = String(h).padStart(2, '0');
    hourSelect.add(new Option(value, value));
  }
  for (let m = 0; m < 60; m += 1) {
    const value = String(m).padStart(2, '0');
    minuteSelect.add(new Option(value, value));
  }
}

function formatSeenDateInput(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const copy = new Date(d);
  copy.setMinutes(copy.getMinutes() - copy.getTimezoneOffset());
  return copy.toISOString().slice(0, 10);
}

function formatSeenHourInput(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const copy = new Date(d);
  copy.setMinutes(copy.getMinutes() - copy.getTimezoneOffset());
  return copy.toISOString().slice(11, 13);
}

function formatSeenMinuteInput(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const copy = new Date(d);
  copy.setMinutes(copy.getMinutes() - copy.getTimezoneOffset());
  return copy.toISOString().slice(14, 16);
}

function combineSeenDateTime(dateValue, hourValue, minuteValue) {
  if (!dateValue) return null;
  const hour = hourValue || '12';
  const minute = minuteValue || '00';
  const parsed = new Date(`${dateValue}T${hour}:${minute}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function setDefaultSeenDateTime(dateInput, hourSelect, minuteSelect) {
  if (!dateInput || !hourSelect || !minuteSelect) return;
  initSeenTimeSelects(hourSelect, minuteSelect);
  if (dateInput.value && hourSelect.value && minuteSelect.value) return;
  const now = new Date();
  if (!dateInput.value) dateInput.value = formatSeenDateInput(now);
  if (!hourSelect.value) hourSelect.value = formatSeenHourInput(now);
  if (!minuteSelect.value) minuteSelect.value = formatSeenMinuteInput(now);
}

function setSeenDateTimeInputs(dateInput, hourSelect, minuteSelect, value) {
  if (!dateInput || !hourSelect || !minuteSelect) return;
  initSeenTimeSelects(hourSelect, minuteSelect);
  const d = value instanceof Date ? value : new Date(value);
  dateInput.value = formatSeenDateInput(d);
  hourSelect.value = formatSeenHourInput(d);
  minuteSelect.value = formatSeenMinuteInput(d);
}

function seenDateTimeIso(dateInput, hourSelect, minuteSelect) {
  const parsed = combineSeenDateTime(
    dateInput?.value,
    hourSelect?.value,
    minuteSelect?.value,
  );
  return parsed ? parsed.toISOString() : '';
}

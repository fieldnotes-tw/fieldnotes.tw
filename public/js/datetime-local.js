function formatSeenDateInput(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const copy = new Date(d);
  copy.setMinutes(copy.getMinutes() - copy.getTimezoneOffset());
  return copy.toISOString().slice(0, 10);
}

function formatSeenTimeParts(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return { hour: '', minute: '' };
  const copy = new Date(d);
  copy.setMinutes(copy.getMinutes() - copy.getTimezoneOffset());
  const time = copy.toISOString().slice(11, 16);
  const [hour = '', minute = ''] = time.split(':');
  return { hour, minute };
}

function populateSeenTimeSelects(hourSelect, minuteSelect) {
  if (!hourSelect || !minuteSelect) return;
  if (!hourSelect.options.length) {
    hourSelect.innerHTML = Array.from({ length: 24 }, (_, h) => {
      const value = String(h).padStart(2, '0');
      return `<option value="${value}">${value}</option>`;
    }).join('');
  }
  if (!minuteSelect.options.length) {
    minuteSelect.innerHTML = Array.from({ length: 60 }, (_, m) => {
      const value = String(m).padStart(2, '0');
      return `<option value="${value}">${value}</option>`;
    }).join('');
  }
}

function combineSeenDateTime(dateValue, hourValue, minuteValue) {
  if (!dateValue) return null;
  const hour = hourValue ?? '12';
  const minute = minuteValue ?? '00';
  const parsed = new Date(
    `${dateValue}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
  );
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function setDefaultSeenDateTime(dateInput, hourSelect, minuteSelect, { force = false } = {}) {
  if (!dateInput || !hourSelect || !minuteSelect) return;
  if (!force && dateInput.dataset.seenConfigured === '1') return;

  populateSeenTimeSelects(hourSelect, minuteSelect);
  const now = new Date();
  dateInput.value = formatSeenDateInput(now);
  const { hour, minute } = formatSeenTimeParts(now);
  hourSelect.value = hour;
  minuteSelect.value = minute;
  dateInput.dataset.seenConfigured = '1';
}

function setSeenDateTimeInputs(dateInput, hourSelect, minuteSelect, value) {
  if (!dateInput || !hourSelect || !minuteSelect) return;
  populateSeenTimeSelects(hourSelect, minuteSelect);
  const d = value instanceof Date ? value : new Date(value);
  dateInput.value = formatSeenDateInput(d);
  const { hour, minute } = formatSeenTimeParts(d);
  hourSelect.value = hour;
  minuteSelect.value = minute;
  dateInput.dataset.seenConfigured = '1';
}

function seenDateTimeIso(dateInput, hourSelect, minuteSelect) {
  const parsed = combineSeenDateTime(
    dateInput?.value,
    hourSelect?.value,
    minuteSelect?.value,
  );
  return parsed ? parsed.toISOString() : '';
}

function applySeenTimeDraft(dateInput, hourSelect, minuteSelect, draft) {
  if (!draft?.seenDate) return false;
  populateSeenTimeSelects(hourSelect, minuteSelect);
  dateInput.value = draft.seenDate;
  if (draft.seenHour && draft.seenMinute) {
    hourSelect.value = draft.seenHour;
    minuteSelect.value = draft.seenMinute;
  } else if (draft.seenTime) {
    const [hour = '12', minute = '00'] = draft.seenTime.split(':');
    hourSelect.value = hour.padStart(2, '0');
    minuteSelect.value = minute.padStart(2, '0');
  }
  dateInput.dataset.seenConfigured = '1';
  return true;
}

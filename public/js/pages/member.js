function $(id) {
  return document.getElementById(id);
}

function setError(msg) {
  const el = $('memberError');
  if (!msg) {
    el.hidden = true;
    el.textContent = '';
    return;
  }
  el.hidden = false;
  el.textContent = msg;
}

function memberIdFromPath() {
  const parts = location.pathname.split('/').filter(Boolean);
  if (parts[0] !== 'members' || !parts[1]) return '';
  return parts[1];
}

function renderAvatar(container, { displayName, avatarUrl }) {
  container.replaceChildren();
  const frame = document.createElement('div');
  frame.className = 'profile-form__avatar-frame';
  const fallback = document.createElement('span');
  fallback.className = 'avatar avatar--lg';
  const label = displayName || '?';
  fallback.textContent = Array.from(label.trim())[0]?.toUpperCase() || '?';
  frame.appendChild(fallback);
  if (avatarUrl) {
    const img = document.createElement('img');
    img.className = 'profile-form__avatar-img';
    img.src = avatarUrl;
    img.alt = '';
    frame.appendChild(img);
    fallback.hidden = true;
  }
  container.appendChild(frame);
}

function formatSeenAt(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return t('home.sighting.date', { month: date.getMonth() + 1, day: date.getDate() });
}

function renderReports(items) {
  const section = $('memberReports');
  const list = $('memberReportList');
  list.replaceChildren();
  if (!items.length) {
    section.hidden = true;
    return;
  }
  section.hidden = false;
  items.forEach((item) => {
    const li = document.createElement('li');
    li.className = 'member-report-list__item';
    const link = document.createElement('a');
    link.className = 'member-report-list__link';
    link.href = `/?phenomenon=${encodeURIComponent(item.phenomenonId)}`;
    const title = document.createElement('strong');
    title.className = 'member-report-list__title';
    title.textContent = item.phenomenonTitle;
    const when = document.createElement('span');
    when.className = 'member-report-list__when';
    when.textContent = formatSeenAt(item.seenAt);
    link.append(title, when);
    if (item.note) {
      const note = document.createElement('p');
      note.className = 'member-report-list__note';
      note.textContent = item.note;
      li.append(link, note);
    } else {
      li.appendChild(link);
    }
    list.appendChild(li);
  });
}

async function boot() {
  await i18nReady;
  const id = memberIdFromPath();
  if (!id) {
    setError(t('errors.notFound'));
    return;
  }
  try {
    const { data } = await api(`/api/members/${id}`);
    const name = data.displayName || t('home.detail.anonymousObserver');
    $('memberName').textContent = name;
    document.title = `${name} · ${t('member.pageTitle')}`;
    renderAvatar($('memberAvatar'), data);
    if (data.bio) {
      $('memberBio').hidden = false;
      $('memberBio').textContent = data.bio;
    }
    renderReports(data.recentSightings || []);
  } catch (err) {
    setError(err.message || t('errors.notFound'));
  }
}

boot();

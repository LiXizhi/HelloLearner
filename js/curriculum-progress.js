export function projectSpeakingWeek(minutesByDate = {}, now = new Date()) {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(now);
    date.setUTCDate(date.getUTCDate() - 6 + index);
    const key = date.toISOString().slice(0, 10);
    const minutes = Number(minutesByDate[key] || 0);
    return {
      day: new Intl.DateTimeFormat('zh-CN', { weekday: 'short', timeZone: 'UTC' }).format(date),
      date: index === 6 ? '今天' : `${date.getUTCMonth() + 1}/${date.getUTCDate()}`,
      minutes: Number.isFinite(minutes) ? Math.max(0, Math.round(minutes * 10) / 10) : 0,
      today: index === 6,
    };
  });
}

export function projectUnitProgress(lessons, completedLessons = {}) {
  const completed = lessons.filter(lesson => Object.hasOwn(completedLessons, lesson.id)).length;
  return {
    completed,
    total: lessons.length,
    percent: lessons.length ? Math.round(completed / lessons.length * 100) : 0,
    nextLessonId: lessons.find(lesson => !Object.hasOwn(completedLessons, lesson.id))?.id || '',
  };
}
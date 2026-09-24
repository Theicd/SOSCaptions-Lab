/**
 * Mock transcript + translations for Phase 1 sync QA.
 * Times fit sample VIDEO/smple.mp4 (~10s).
 */
(function (global) {
  'use strict';

  /** @type {Array<{id:string,start:number,end:number,text:string}>} */
  const ORIGINAL_EN = [
    { id: 'c1', start: 0.0, end: 1.4, text: 'Welcome to the captions lab.' },
    { id: 'c2', start: 1.4, end: 2.8, text: 'This overlay follows the video clock.' },
    { id: 'c3', start: 2.8, end: 4.2, text: 'Pause, seek, and change speed — text stays in sync.' },
    { id: 'c4', start: 4.2, end: 5.6, text: 'Switch language without burning into the file.' },
    { id: 'c5', start: 5.6, end: 7.0, text: 'Hebrew and Arabic flip to right-to-left.' },
    { id: 'c6', start: 7.0, end: 8.4, text: 'Edit a card below and see it update live.' },
    { id: 'c7', start: 8.4, end: 9.4, text: 'Phase one is mock only — no Whisper yet.' },
    { id: 'c8', start: 9.4, end: 10.2, text: 'Ready for TikTok-style caption editing.' }
  ];

  const TRANSLATIONS = {
    he: [
      { id: 'c1', start: 0.0, end: 1.4, text: 'ברוכים הבאים למעבדת הכתוביות.' },
      { id: 'c2', start: 1.4, end: 2.8, text: 'השכבה הזו עוקבת אחרי שעון הווידאו.' },
      { id: 'c3', start: 2.8, end: 4.2, text: 'השהה, דלג ושנה מהירות — הטקסט נשאר מסונכרן.' },
      { id: 'c4', start: 4.2, end: 5.6, text: 'החלף שפה בלי לצרוב לקובץ.' },
      { id: 'c5', start: 5.6, end: 7.0, text: 'עברית וערבית עוברות לימין-לשמאל.' },
      { id: 'c6', start: 7.0, end: 8.4, text: 'ערוך כרטיס למטה ותראה עדכון חי.' },
      { id: 'c7', start: 8.4, end: 9.4, text: 'שלב אחד הוא mock בלבד — בלי Whisper עדיין.' },
      { id: 'c8', start: 9.4, end: 10.2, text: 'מוכן לעריכת כתוביות בסגנון טיקטוק.' }
    ],
    ar: [
      { id: 'c1', start: 0.0, end: 1.4, text: 'مرحبًا بكم في مختبر التسميات.' },
      { id: 'c2', start: 1.4, end: 2.8, text: 'هذه الطبقة تتبع ساعة الفيديو.' },
      { id: 'c3', start: 2.8, end: 4.2, text: 'أوقف واقفز وغيّر السرعة — النص يبقى متزامنًا.' },
      { id: 'c4', start: 4.2, end: 5.6, text: 'بدّل اللغة دون حرقها في الملف.' },
      { id: 'c5', start: 5.6, end: 7.0, text: 'العبرية والعربية تنتقلان من اليمين لليسار.' },
      { id: 'c6', start: 7.0, end: 8.4, text: 'عدّل بطاقة بالأسفل وشاهد التحديث فورًا.' },
      { id: 'c7', start: 8.4, end: 9.4, text: 'المرحلة الأولى محاكاة فقط — بلا Whisper بعد.' },
      { id: 'c8', start: 9.4, end: 10.2, text: 'جاهز لتحرير التسميات بأسلوب تيك توك.' }
    ],
    ru: [
      { id: 'c1', start: 0.0, end: 1.4, text: 'Добро пожаловать в лабораторию субтитров.' },
      { id: 'c2', start: 1.4, end: 2.8, text: 'Этот оверлей следует за часами видео.' },
      { id: 'c3', start: 2.8, end: 4.2, text: 'Пауза, перемотка и скорость — текст в синхроне.' },
      { id: 'c4', start: 4.2, end: 5.6, text: 'Меняйте язык без записи в файл.' },
      { id: 'c5', start: 5.6, end: 7.0, text: 'Иврит и арабский переключаются на RTL.' },
      { id: 'c6', start: 7.0, end: 8.4, text: 'Правите карточку ниже — обновление сразу.' },
      { id: 'c7', start: 8.4, end: 9.4, text: 'Фаза один — только mock, без Whisper.' },
      { id: 'c8', start: 9.4, end: 10.2, text: 'Готово к правке субтитров в стиле TikTok.' }
    ],
    es: [
      { id: 'c1', start: 0.0, end: 1.4, text: 'Bienvenido al laboratorio de subtítulos.' },
      { id: 'c2', start: 1.4, end: 2.8, text: 'Esta capa sigue el reloj del vídeo.' },
      { id: 'c3', start: 2.8, end: 4.2, text: 'Pausa, busca y cambia velocidad — el texto se sincroniza.' },
      { id: 'c4', start: 4.2, end: 5.6, text: 'Cambia el idioma sin grabarlo en el archivo.' },
      { id: 'c5', start: 5.6, end: 7.0, text: 'Hebreo y árabe pasan a derecha-izquierda.' },
      { id: 'c6', start: 7.0, end: 8.4, text: 'Edita una tarjeta abajo y verás el cambio en vivo.' },
      { id: 'c7', start: 8.4, end: 9.4, text: 'La fase uno es solo mock — sin Whisper aún.' },
      { id: 'c8', start: 9.4, end: 10.2, text: 'Listo para editar subtítulos al estilo TikTok.' }
    ]
  };

  function cloneTrack(rows) {
    return rows.map(function (r) {
      return { id: r.id, start: r.start, end: r.end, text: r.text };
    });
  }

  const MockCaptions = {
    getOriginal: function () {
      return cloneTrack(ORIGINAL_EN);
    },
    getTrack: function (lang) {
      const code = String(lang || 'en').toLowerCase();
      if (code === 'en') return cloneTrack(ORIGINAL_EN);
      const t = TRANSLATIONS[code];
      return t ? cloneTrack(t) : cloneTrack(ORIGINAL_EN);
    },
    getAllLanguages: function () {
      return ['en'].concat(Object.keys(TRANSLATIONS));
    }
  };

  global.MockCaptions = MockCaptions;
})(typeof window !== 'undefined' ? window : globalThis);

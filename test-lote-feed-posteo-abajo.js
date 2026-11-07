// test-lote-feed-posteo-abajo.js — LOTE FEED-POSTEO-ABAJO · 6/11
//
// BUG EN VIVO (reporte de Valentino 6/11 21:21): «Se elimino el posteo de
// abajo. Eso no deberia suceder» + «Todos los posteos del feed tienen que
// aparecer». Captura iOS 9:21, feed v739: carta velada arriba + grilla 3×3
// con 9 tiles, pero @posty.communitymanager tiene 13 posteos en IG y el
// usuario 12 tiene 12 imágenes published en la DB.
//
// CAUSA RAÍZ: feed-audit.js `localizeTrialPhotos` hacía
// `profile.photos.slice(0, 9)` — el 9 era la tira 3×3 de la prueba — pero
// el home (`homeProfileFromRead`, server.js) reutiliza esa función para
// TODOS los recents: los posteos a partir del 10º quedaban con img null y
// el `.filter((r) => r.img)` los tiraba del snapshot. Los 4 que faltan son
// exactamente los 4 más viejos de IG: 30/10, 29/10, 28/10 y 20/10.
//
// EL FIX: se quita el `.slice(0, 9)` de `localizeTrialPhotos`. La tira de
// la prueba sigue capada en su propio sitio (trialProfileFromAudit:
// photos .slice(0, 9)); la tira «antes» de /api/postpay/status sigue en 9
// (3×3 por diseño). Sin cap, sin ventana que corte: TODOS aparecen.
//
// SOSPECHOSOS DESCARTADOS (con evidencia, ver STATUS del lote):
// (a) cap en homeGridCompose / /api/posts: no hay — el render rinde todo;
// (b) /media sin paging.next: no — fetchOfficialMedia pagina (máx 5
//     páginas / 250 ítems) y el merge trae los 13;
// (c) guard ya_publicado_hoy / 1-por-día: no esconde tiles del feed;
// (d) carta velada / destapado v733: no quita recents;
// (e) borrado-ig: los 4 faltantes SIGUEN en IG (verificado por CLI);
// (f) stories mezcladas: las 4 stories published se filtran bien y los 4
//     faltantes son media_type image.
//
// LA SUITE CAZA EL COMPORTAMIENTO:
// - A (estático): el cap salió de localizeTrialPhotos; la tira de la
//   prueba y la tira «antes» de postpay siguen en 9; el render no capa.
// - B (unitario, offline): localizeTrialPhotos con las 13 miniaturas
//   reales de IG → 13; con 9 → 9; con 25 → 25; con 1 descarga fallida →
//   12 (falla por foto, no por lote); los 4 más viejos sobreviven.
// - C (home, offline): la homeProfileFromRead REAL del árbol (extraída
//   del server.js por VM) con los 13 posteos de hoy + 2 hijos de carrusel
//   → recents 13, con los 4 viejos dentro y los hijos fuera.
// - D (baselines PRE==POST): prueba-chat, onboardingperfecto,
//   prueba-3-posteos, copy-2-reels, post-oculto-respira,
//   plan-posty-corregido e ig-buscador dan los mismos conteos en este
//   árbol que en el prístino v739.
//
// Uso: node test-lote-feed-posteo-abajo.js            (árbol actual)
//      BASE=/ruta/al/arbol node test-lote-feed-posteo-abajo.js
// En prístino v739 debe FALLAR (13→9). En este árbol debe dar 0 fallos.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');
const { execSync } = require('child_process');

const BASE = process.env.BASE || __dirname;
const PRISTINE = process.env.PRISTINE || '/home/hatch/workspace/.lote-feed-posteo-abajo-scratch/pristine-v739';
let okN = 0, badN = 0, skipN = 0;
const t = (cond, name) => { if (cond) { okN++; } else { badN++; console.log('✗', name); } };
const skip = (name) => { skipN++; console.log('~ salteado:', name); };
const read = (rel) => fs.readFileSync(path.join(BASE, rel), 'utf8');

const feedAudit = require(path.join(BASE, 'feed-audit.js'));
const feedReconcile = require(path.join(BASE, 'feed-reconcile.js'));

// Las 13 miniaturas reales de IG (@posty.communitymanager, CLI 7/11),
// EMBEBIDAS en la suite para que sea autocontenida (sin /tmp ni red).
const IG13 = [{"created_at": "2026-11-06 14:00:10", "media_type": "image", "url": "https://www.instagram.com/p/DfaoRJTD7UA/", "thumbnail_url": "https://scontent-den2-1.cdninstagram.com/v/t51.82787-15/893312054_18130540693804836_2142927686955268430_n.jpg?stp=dst-jpg_e35_tt6&_nc_cat=100&ccb=7-5&_nc_sid=18de74&efg=eyJlZmdfdGFnIjoiRkVFRC5iZXN0X2ltYWdlX3VybGdlbi5DMiJ9&_nc_ohc=ARhnasNuI8UQ7kNvwFfW9R9&_nc_oc=Adptt9iaaGWQsXmPT678EwoWwjE4wolh8q7kcfO1SxOGlfXc_U9Cr14VW-bSu-tykl6IrncjADRq-9rMIxH6cM2I&_nc_zt=23&_nc_ht=scontent-den2-1.cdninstagram.com&_nc_gid=HHLse8H3Tm-r3IVoqFlhpw&oh=00_AQRBWpXpdNePTy07mWvYKBpma-1PtYs9mlnaLOr8PYqqBw&oe=6AF46C06"}, {"created_at": "2026-11-04 09:58:41", "media_type": "image", "url": "https://www.instagram.com/p/DfVDDFAjKeG/", "thumbnail_url": "https://scontent-den2-1.cdninstagram.com/v/t51.82787-15/885665156_18130063441804836_3971167651997503135_n.jpg?stp=dst-jpg_e35_tt6&_nc_cat=106&ccb=7-5&_nc_sid=18de74&efg=eyJlZmdfdGFnIjoiRkVFRC5iZXN0X2ltYWdlX3VybGdlbi5DMiJ9&_nc_ohc=dFvSxXgZb2EQ7kNvwEgoej4&_nc_oc=AdoJQWQ6kjfWIayGKghDyj90hpbEMOYVTLaQcNp8cV79onMapvvz20mQlAMMn42CI-A_rIl5tBF15ZkccgPa1suH&_nc_zt=23&_nc_ht=scontent-den2-1.cdninstagram.com&_nc_gid=HHLse8H3Tm-r3IVoqFlhpw&oh=00_AQTeSkswBTkTfBWgvu4Rf6hZcfOhJf6ohk0ejJ5Fs37aJw&oe=6AF44AF5"}, {"created_at": "2026-11-04 09:55:18", "media_type": "carousel", "url": "https://www.instagram.com/p/DfVCqgdjCrO/", "thumbnail_url": "https://scontent-den2-1.cdninstagram.com/v/t51.82787-15/886641902_18130062523804836_1022378586162104347_n.jpg?stp=dst-jpg_e35_tt6&_nc_cat=109&ccb=7-5&_nc_sid=18de74&efg=eyJlZmdfdGFnIjoiQ0FST1VTRUxfSVRFTS5iZXN0X2ltYWdlX3VybGdlbi5DMiJ9&_nc_ohc=DLXrYze4dvsQ7kNvwHHbh-Z&_nc_oc=AdpQqIxkxXw0XP4UQd9ue7KTuMSBhUN3-R_hQaRoDcN4LD_2BhjXP8nHCKK3pQjBwv3k1QXbT97OAsrFHIiuB_cL&_nc_zt=23&_nc_ht=scontent-den2-1.cdninstagram.com&_nc_gid=HHLse8H3Tm-r3IVoqFlhpw&oh=00_AQRb5o9yuJxusttv-_e-ZfszQupoqlB6rtvB9vck2KFmNA&oe=6AF4713F"}, {"created_at": "2026-11-03 03:01:20", "media_type": "image", "url": "https://www.instagram.com/p/DfRt0axD0G0/", "thumbnail_url": "https://scontent-den2-1.cdninstagram.com/v/t51.82787-15/885276246_18129759595804836_3484068063319534138_n.jpg?stp=dst-jpg_e35_tt6&_nc_cat=109&ccb=7-5&_nc_sid=18de74&efg=eyJlZmdfdGFnIjoiRkVFRC5iZXN0X2ltYWdlX3VybGdlbi5DMiJ9&_nc_ohc=X86Cvb6eJ8cQ7kNvwENOqzY&_nc_oc=AdpiUTcDQb2oEOMg4bNbC598umol8kH7Hu9d43h0fVM1b5yngXQmp81LKDd1-WeUdPVhFlBFUmHsoc7EGcwso3Da&_nc_zt=23&_nc_ht=scontent-den2-1.cdninstagram.com&_nc_gid=HHLse8H3Tm-r3IVoqFlhpw&oh=00_AQT6iYcRpTD0LOsQq55E9Bc62kvKtGHE0c3er-jFRbJwrg&oe=6AF4645C"}, {"created_at": "2026-11-03 02:36:07", "media_type": "carousel", "url": "https://www.instagram.com/p/DfRrm2Vj8Qa/", "thumbnail_url": "https://scontent-den2-1.cdninstagram.com/v/t51.82787-15/885128721_18129756874804836_4131651867379134149_n.jpg?stp=dst-jpg_e35_tt6&_nc_cat=101&ccb=7-5&_nc_sid=18de74&efg=eyJlZmdfdGFnIjoiQ0FST1VTRUxfSVRFTS5iZXN0X2ltYWdlX3VybGdlbi5DMiJ9&_nc_ohc=6FSBGPtYZbgQ7kNvwGsWDam&_nc_oc=Adpf3InHsl2QCAgZ2c8B27roRdh10k1jLVwKmDCGuNzNpz0KMfPryvrjPalLew0ivhr-yP6_R973rJuYegj1eNKy&_nc_zt=23&_nc_ht=scontent-den2-1.cdninstagram.com&_nc_gid=HHLse8H3Tm-r3IVoqFlhpw&oh=00_AQT-7lXj7T9bwDRrURzPKmdMeyUpaSZZPw2sjgWg5CLQZg&oe=6AF44F2B"}, {"created_at": "2026-11-01 16:33:00", "media_type": "image", "url": "https://www.instagram.com/p/DfOBymGj4q9/", "thumbnail_url": "https://scontent-den2-1.cdninstagram.com/v/t51.82787-15/886586999_18129448333804836_107648327704282492_n.jpg?stp=dst-jpg_e35_tt6&_nc_cat=102&ccb=7-5&_nc_sid=18de74&efg=eyJlZmdfdGFnIjoiRkVFRC5iZXN0X2ltYWdlX3VybGdlbi5DMiJ9&_nc_ohc=fxZQdoD-qAIQ7kNvwGqEytX&_nc_oc=AdprskcnziECRGLtRLlZdwhJ_mLQ1qVaJtCZrgmp6VaOn6bvqv_XD-OkD3TK6KMQtp2WnSAVRFoc1eEThR1Ka1FK&_nc_zt=23&_nc_ht=scontent-den2-1.cdninstagram.com&_nc_gid=HHLse8H3Tm-r3IVoqFlhpw&oh=00_AQQYaIqTAX3owBlUqdOdcShLxryODfoGDgXrMpCrTZcFIA&oe=6AF46F4F"}, {"created_at": "2026-10-31 05:23:26", "media_type": "image", "url": "https://www.instagram.com/p/DfKJgUQj3y-/", "thumbnail_url": "https://scontent-den2-1.cdninstagram.com/v/t51.82787-15/874101626_18129040147804836_4545477639065764013_n.jpg?stp=dst-jpg_e35_tt6&_nc_cat=109&ccb=7-5&_nc_sid=18de74&efg=eyJlZmdfdGFnIjoiRkVFRC5iZXN0X2ltYWdlX3VybGdlbi5DMiJ9&_nc_ohc=dRQd8W6K2UsQ7kNvwFYNFoV&_nc_oc=AdrBFY4drRb7fWHAYZ8d6E5olF1f4x17_WKzRhD7bTvPN4jDWYTb8PADa8vAvmWaqPfOgTg6KeNH6Mt9R1wvUzk5&_nc_zt=23&_nc_ht=scontent-den2-1.cdninstagram.com&_nc_gid=HHLse8H3Tm-r3IVoqFlhpw&oh=00_AQTcOjawvrKGuBtIfGB0Ix6AdrNE_rGHD8Fw1IVaVeKesA&oe=6AF44DE8"}, {"created_at": "2026-10-30 15:00:03", "media_type": "image", "url": "https://www.instagram.com/p/DfIad5HDw8z/", "thumbnail_url": "https://scontent-den2-1.cdninstagram.com/v/t51.82787-15/873992978_18128872552804836_5183622829593159518_n.jpg?stp=dst-jpg_e35_tt6&_nc_cat=107&ccb=7-5&_nc_sid=18de74&efg=eyJlZmdfdGFnIjoiRkVFRC5iZXN0X2ltYWdlX3VybGdlbi5DMiJ9&_nc_ohc=BEnwLu1WRb4Q7kNvwEjNfZc&_nc_oc=AdpH75y8yEWXeGKOh_LIJJ_ml9LVAjGg4C3_65uMiin9U_DSqRmgYwJ7boE26w6Oc4NgHKYYr9LhxxGcjTEY4TmL&_nc_zt=23&_nc_ht=scontent-den2-1.cdninstagram.com&_nc_gid=HHLse8H3Tm-r3IVoqFlhpw&oh=00_AQQThJuuzzGIW-OLLijGqf_koP3e2lzhOfr65nfBd7857g&oe=6AF44D15"}, {"created_at": "2026-10-29 07:45:50", "media_type": "image", "url": "https://www.instagram.com/p/DfFQNY4D_Yt/", "thumbnail_url": "https://scontent-den2-1.cdninstagram.com/v/t51.82787-15/873599744_18128558182804836_277103348189407989_n.jpg?stp=dst-jpg_e35_tt6&_nc_cat=109&ccb=7-5&_nc_sid=18de74&efg=eyJlZmdfdGFnIjoiRkVFRC5iZXN0X2ltYWdlX3VybGdlbi5DMiJ9&_nc_ohc=YIdTHejqDGkQ7kNvwFtjGiL&_nc_oc=Adqv_t299FgMelwRfkx91-vxKeH4ePIn-S9GRoYPPmzBHXk59yqGvcsMfXetjkxAyb2G1-W8Nt4foI6BF8_2XXNm&_nc_zt=23&_nc_ht=scontent-den2-1.cdninstagram.com&_nc_gid=HHLse8H3Tm-r3IVoqFlhpw&oh=00_AQTbVHL02MNhKh_GET6pWdUwBx_ZrOeXq0eM6VYupv_r8g&oe=6AF47213"}, {"created_at": "2026-10-28 08:57:52", "media_type": "image", "url": "https://www.instagram.com/p/DfCzqFdE5yz/", "thumbnail_url": "https://scontent-den2-1.cdninstagram.com/v/t51.82787-15/868682142_18128303692804836_2047395525199342072_n.jpg?stp=dst-jpg_e35_tt6&_nc_cat=105&ccb=7-5&_nc_sid=18de74&efg=eyJlZmdfdGFnIjoiRkVFRC5iZXN0X2ltYWdlX3VybGdlbi5DMiJ9&_nc_ohc=fM4mbY0zgOcQ7kNvwEd6Ps7&_nc_oc=Adp7mAmT7R6GDeCMIG0hd7i5Uxr9Kc3XrBnHqlbIRwsDqidnX3fnOPEfSG1SlBJSjt0x5tVrM6o0e7QtfNHwhIMr&_nc_zt=23&_nc_ht=scontent-den2-1.cdninstagram.com&_nc_gid=HHLse8H3Tm-r3IVoqFlhpw&oh=00_AQRrwEDaOtzVlnQDG4CKYFACXK4R2x0icpfxRl5d6h3SQg&oe=6AF445B7"}, {"created_at": "2026-10-20 15:42:32", "media_type": "image", "url": "https://www.instagram.com/p/Deu7nAFji6X/", "thumbnail_url": "https://scontent-den2-1.cdninstagram.com/v/t51.82787-15/859025877_18126256960804836_6736132023839859954_n.jpg?stp=dst-jpg_e35_tt6&_nc_cat=110&ccb=7-5&_nc_sid=18de74&efg=eyJlZmdfdGFnIjoiRkVFRC5iZXN0X2ltYWdlX3VybGdlbi5DMiJ9&_nc_ohc=wGGi5VMY3UEQ7kNvwGybFbb&_nc_oc=Adpm8BmwEVUyo5ap-eVHKc6jNA_1pa0NtXsVRr9AAR-mtnRZjegN7ZhoZSYmWIOq5WXDfpSYPZhiwZnwnaq34q-F&_nc_zt=23&_nc_ht=scontent-den2-1.cdninstagram.com&_nc_gid=HHLse8H3Tm-r3IVoqFlhpw&oh=00_AQTOZx6QK4A8pdNDY1lT7jvrDSYygC6G_mIIWE0Zp4P8sQ&oe=6AF45A52"}, {"created_at": "2026-11-04 09:58:07", "media_type": "video", "url": "https://www.instagram.com/reel/DfVC-LFMau1/", "thumbnail_url": "https://scontent-den2-1.cdninstagram.com/v/t51.82787-15/883374896_18130063405804836_2920914642781091975_n.jpg?stp=dst-jpg_e35_tt6&_nc_cat=102&ccb=7-5&_nc_sid=18de74&efg=eyJlZmdfdGFnIjoiQ0xJUFMuYmVzdF9pbWFnZV91cmxnZW4uQzIifQ%3D%3D&_nc_ohc=G1tF03Is2XMQ7kNvwGt_T3L&_nc_oc=AdrFMCysW3p1J_C2eL8hl-hgrPjkaLPPoCMtY-g_5Ir2URfDOCLy9hjUpC0e88OfUiO-WOoJAtR7VFPDoBaKntzh&_nc_zt=23&_nc_ht=scontent-den2-1.cdninstagram.com&_nc_gid=HHLse8H3Tm-r3IVoqFlhpw&oh=00_AQS5Xegy0IGjKUp-sPLCyon5FBs70lM5_nwHKfRV_fqgCQ&oe=6AF45EC9"}, {"created_at": "2026-11-03 02:46:26", "media_type": "video", "url": "https://www.instagram.com/reel/DfRsxGrSssF/", "thumbnail_url": "https://scontent-den2-1.cdninstagram.com/v/t51.82787-15/884640991_18129758431804836_1448411816032743381_n.jpg?stp=dst-jpg_e35_tt6&_nc_cat=111&ccb=7-5&_nc_sid=18de74&efg=eyJlZmdfdGFnIjoiQ0xJUFMuYmVzdF9pbWFnZV91cmxnZW4uQzIifQ%3D%3D&_nc_ohc=U6XaGkIfrmUQ7kNvwG56sLy&_nc_oc=AdpyEIjmTCKguxFqb-tGfP1Z24yRg8ZNKtDSRDuhT49lAJNspHPYIvIKHtpyVejZ2XvZfU1bHTIg25epCg1ZGeAj&_nc_zt=23&_nc_ht=scontent-den2-1.cdninstagram.com&_nc_gid=HHLse8H3Tm-r3IVoqFlhpw&oh=00_AQSku8DmI-c8oeUakSQP7wW1AclW_BC5-gKqGYmj1V1zUA&oe=6AF46106"}];
const byDate = [...IG13].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
const shortcodeOf = (p) => { const m = /instagram\.com\/(?:p|reel)\/([^/]+)/.exec(p.url || ''); return m ? m[1] : null; };

(async () => {
  // ---------- A. Estático ----------
  const FA = read('feed-audit.js');
  const faLocalize = FA.slice(FA.indexOf('async function localizeTrialPhotos'));
  const faLocalizeBody = faLocalize.slice(0, faLocalize.indexOf('\n}\n') + 3);
  t(!/photos\.slice\(0,\s*9\)/.test(faLocalizeBody), 'feed-audit.js: localizeTrialPhotos ya no capa a 9 (sin photos.slice(0, 9))');
  t(/profile\.photos\s*=\s*await Promise\.all\(profile\.photos\.map\(/.test(faLocalizeBody), 'feed-audit.js: localizeTrialPhotos localiza profile.photos entero');
  t(/photos: \(data\.posts \|\| \[\]\)\.map\(\(x\) => \(x && x\.thumb\) \|\| null\)\.filter\(Boolean\)\.slice\(0, 9\)/.test(FA), 'feed-audit.js: la tira 3×3 de la PRUEBA sigue capada en trialProfileFromAudit (no se tocó)');
  const SRV = read('server.js');
  const slices9 = (SRV.match(/\.slice\(0, 9\)/g) || []).length;
  t(slices9 === 1, `server.js: queda un solo .slice(0, 9) (${slices9}) — la tira «antes» de /api/postpay/status, 3×3 por diseño`);
  const postpayIdx = SRV.indexOf('.slice(0, 9)');
  t(SRV.slice(Math.max(0, postpayIdx - 2000), postpayIdx).includes('postpay'), 'server.js: ese único .slice(0, 9) vive en el handler de postpay');
  t(!/\.slice\(0,\s*9\)/.test(read('public/app.js')), 'public/app.js: el render del feed no tiene ningún .slice(0, 9)');
  t(SRV.includes('async function homeProfileFromRead(handle, data)'), 'server.js: homeProfileFromRead sigue existiendo');
  t(SRV.includes("})).filter((r) => r.img)"), 'server.js: homeProfileFromRead sigue filtrando recents sin imagen (img null fuera)');

  // ---------- B. Unitario: localizeTrialPhotos (offline, stub de descarga) ----------
  const stubFetch = async () => Buffer.alloc(3000, 0x89);
  const runLocalize = async (urls) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'feed-abajo-b-'));
    const prof = { handle: 'posty.communitymanager', photos: [...urls] };
    await feedAudit.localizeTrialPhotos(prof, dir, stubFetch);
    fs.rmSync(dir, { recursive: true, force: true });
    return prof.photos;
  };
  const thumbs13 = byDate.map((p) => p.thumbnail_url);
  const out13 = await runLocalize(thumbs13);
  t(out13.length === 13, `B: 13 miniaturas reales de IG → 13 localizadas (${out13.length})`);
  t(out13.every((x) => typeof x === 'string' && x.startsWith('/media/igthumb-')), 'B: las 13 localizadas son /media/igthumb-*.jpg');
  // Las 4 más viejas (índices 9-12) sobreviven y mapean a su URL por hash.
  const expectedName = (url) => 'igthumb-' + crypto.createHash('sha256').update('posty.communitymanager|' + url).digest('hex').slice(0, 24) + '.jpg';
  const old4 = [9, 10, 11, 12].every((i) => out13[i] === '/media/' + expectedName(thumbs13[i]));
  t(old4, 'B: los 4 posteos más viejos (30/10, 29/10, 28/10, 20/10) sobreviven con su miniatura');
  const out9 = await runLocalize(thumbs13.slice(0, 9));
  t(out9.length === 9, `B: 9 miniaturas → 9 (sin regresión en cuentas chicas, ${out9.length})`);
  const out25 = await runLocalize(Array.from({ length: 25 }, (_, i) => `https://scontent.cdninstagram.com/v/t51/fake-${i}.jpg`));
  t(out25.length === 25, `B: 25 miniaturas → 25 (ningún cap a ningún N, ${out25.length})`);
  const out0 = await runLocalize([]);
  t(out0.length === 0, 'B: 0 miniaturas → 0');
  const failingFetch = async (u) => { if (u.includes('fake-7')) throw new Error('red caída'); return Buffer.alloc(3000, 0x89); };
  const dirF = fs.mkdtempSync(path.join(os.tmpdir(), 'feed-abajo-bf-'));
  const profF = { handle: 'posty.communitymanager', photos: Array.from({ length: 13 }, (_, i) => `https://scontent.cdninstagram.com/v/t51/fake-${i}.jpg`) };
  await feedAudit.localizeTrialPhotos(profF, dirF, failingFetch);
  fs.rmSync(dirF, { recursive: true, force: true });
  t(profF.photos.filter(Boolean).length === 12 && profF.photos[7] === null, 'B: 1 descarga fallida → 12 localizadas y solo esa en null (falla por foto, no por lote)');

  // ---------- C. Home: la homeProfileFromRead REAL del árbol (VM, offline) ----------
  // Extrae la función del server.js (sin bootear el servidor) con un
  // escaneo que respeta strings y comentarios; corre con los módulos
  // reales feed-audit y feed-reconcile y un MEDIA_DIR temporal cuya caché
  // se pre-siembra (hash determinístico) para no necesitar red.
  const extractFn = (src, marker) => {
    const start = src.indexOf(marker);
    if (start < 0) return null;
    let i = src.indexOf('{', start);
    if (i < 0) return null;
    let depth = 0, state = null, esc = false;
    for (; i < src.length; i++) {
      const c = src[i], n = src[i + 1];
      if (state === 'line') { if (c === '\n') state = null; continue; }
      if (state === 'block') { if (c === '*' && n === '/') { state = null; i++; } continue; }
      if (state === 'sq' || state === 'dq' || state === 'bt') {
        if (esc) { esc = false; continue; }
        if (c === '\\') { esc = true; continue; }
        if ((state === 'sq' && c === "'") || (state === 'dq' && c === '"') || (state === 'bt' && c === '`')) state = null;
        continue;
      }
      if (c === '/' && n === '/') { state = 'line'; continue; }
      if (c === '/' && n === '*') { state = 'block'; continue; }
      if (c === "'") { state = 'sq'; continue; }
      if (c === '"') { state = 'dq'; continue; }
      if (c === '`') { state = 'bt'; continue; }
      if (c === '{') depth++;
      if (c === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
    }
    return null;
  };
  const igCat = extractFn(SRV, 'function igCategoryFields(key)');
  const hpf = extractFn(SRV, 'async function homeProfileFromRead(handle, data)');
  t(!!igCat && !!hpf, 'C: homeProfileFromRead + igCategoryFields extraídas del server.js real');
  if (igCat && hpf) {
    const mediaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'feed-abajo-c-'));
    // Pre-siembra de caché: el nombre es determinístico (hash handle|url).
    for (const p of byDate) {
      const name = 'igthumb-' + crypto.createHash('sha256').update('posty.communitymanager|' + p.thumbnail_url).digest('hex').slice(0, 24) + '.jpg';
      fs.writeFileSync(path.join(mediaDir, name), Buffer.alloc(2000, 0x89));
    }
    const typeOf = (m) => (m === 'video' ? 'GraphVideo' : m === 'carousel' ? 'GraphSidecar' : 'GraphImage');
    const fakePosts = byDate.map((p) => ({
      type: typeOf(p.media_type),
      shortcode: shortcodeOf(p),
      taken_at: Math.floor(new Date(p.created_at).getTime() / 1000),
      caption: 'Post del ' + p.created_at.slice(0, 10),
      thumb: p.thumbnail_url,
    }));
    // 2 hijos de carrusel (sin fecha ni caption): NO son posteos.
    fakePosts.push(
      { type: 'GraphImage', shortcode: 'hijo1', thumb: 'https://scontent.cdninstagram.com/v/t51/hijo-1.jpg' },
      { type: 'GraphImage', shortcode: 'hijo2', thumb: 'https://scontent.cdninstagram.com/v/t51/hijo-2.jpg' },
    );
    const data = {
      ok: true,
      profile: { handle: 'posty.communitymanager', name: 'Posty', bio: 'Community manager', followers: 120, posts_count: 13, following: 50, pic: null, link: '' },
      posts: fakePosts,
    };
    const sandbox = { feedAudit, feedReconcile, MEDIA_DIR: mediaDir, Date, console, IG_CATEGORY_LABELS: {} };
    vm.createContext(sandbox);
    vm.runInContext(igCat + '\n' + hpf + '\nthis.__hpf = homeProfileFromRead;', sandbox);
    const prof = await sandbox.__hpf('posty.communitymanager', data);
    fs.rmSync(mediaDir, { recursive: true, force: true });
    t(!!prof, 'C: homeProfileFromRead devuelve perfil');
    if (prof) {
      t(Array.isArray(prof.recents) && prof.recents.length === 13, `C: caso exacto de hoy — 13 posteos de IG → 13 recents (${prof.recents ? prof.recents.length : 'null'})`);
      const codes = prof.recents.map((r) => r.shortcode);
      t(codes.includes('DfIad5HDw8z') && codes.includes('DfFQNY4D_Yt') && codes.includes('DfCzqFdE5yz') && codes.includes('Deu7nAFji6X'), 'C: los 4 posteos de abajo (30/10, 29/10, 28/10, 20/10) están en recents');
      t(prof.recents.every((r) => typeof r.img === 'string' && r.img.startsWith('/media/igthumb-')), 'C: todos los recents tienen img localizada');
      t(!codes.includes('hijo1') && !codes.includes('hijo2'), 'C: los hijos de carrusel siguen fuera de recents');
      const ts = prof.recents.map((r) => r.taken_at);
      t(ts.every((v, i) => i === 0 || ts[i - 1] >= v), 'C: recents en orden nuevo→viejo');
      t(prof.posts_count === 13, `C: posts_count 13 (${prof.posts_count})`);
    }
  }

  // ---------- D. Baselines PRE==POST ----------
  const runSuite = (file, base) => {
    try {
      const o = execSync(`node ${path.join(base, file)}`, { env: { ...process.env, BASE: base }, cwd: base, timeout: 300000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).toString();
      const m = o.match(/(\d+) ok[^0-9]*(\d+) (fallos|fallas|FAIL)/) || o.match(/(\d+) OK, (\d+) FAIL/);
      return m ? { ok: Number(m[1]), fail: Number(m[2]), raw: o } : { ok: null, fail: null, raw: o };
    } catch (e) {
      const o = String((e.stdout || '') + (e.stderr || ''));
      const m = o.match(/(\d+) ok[^0-9]*(\d+) (fallos|fallas|FAIL)/) || o.match(/(\d+) OK, (\d+) FAIL/);
      return m ? { ok: Number(m[1]), fail: Number(m[2]), raw: o } : { ok: null, fail: null, raw: o };
    }
  };
  for (const file of ['test-lote-prueba-chat.js', 'test-lote-onboardingperfecto.js', 'test-lote-prueba-3-posteos.js', 'test-lote-copy-2-reels.js', 'test-lote-post-oculto-respira.js', 'test-lote-plan-posty-corregido.js', 'test-lote-ig-buscador.js']) {
    if (!fs.existsSync(path.join(PRISTINE, file))) { skip(`baseline ${file}: no existe en prístino`); continue; }
    const pre = runSuite(file, PRISTINE);
    const post = runSuite(file, BASE);
    t(pre.ok !== null && post.ok !== null, `baseline ${file}: se pudieron leer los conteos PRE y POST`);
    if (pre.ok !== null && post.ok !== null) {
      t(pre.ok === post.ok && pre.fail === post.fail, `baseline ${file}: PRE==POST (${pre.ok}/${pre.fail} → ${post.ok}/${post.fail})`);
    }
  }

  console.log(`\ntest-lote-feed-posteo-abajo: ${okN} ok, ${badN} fallos, ${skipN} salteados`);
  process.exit(badN ? 1 : 0);
})().catch((e) => { console.error('ERROR suite:', e); process.exit(2); });

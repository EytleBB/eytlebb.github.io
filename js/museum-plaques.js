import * as THREE from 'three';
import { PLAQUE_WIDTH, PLAQUE_HEIGHT, plaquePlacement } from './museum-plaque-layout.js?v=guestbook-20260922';

// Texture records belong to resident artwork slots, not the infinite hall.
export function createMuseumPlaques({ lang, halfWidth = 3 }) {
  const text = (zh, en, ko) => lang === 'en' ? en : lang === 'ko' ? ko : zh;
  const records = new Map();
  const summaries = new Map();
  const plaqueGeometry = new THREE.PlaneGeometry(PLAQUE_WIDTH, PLAQUE_HEIGHT);
  const titleGeometry = new THREE.PlaneGeometry(0.72, 0.115);
  const serif = '"Noto Serif CJK SC", "Songti SC", "Batang", Georgia, serif';
  const sans = '"Noto Sans CJK SC", "PingFang SC", system-ui, sans-serif';

  function fitText(ctx, value, width, size, min = 13) {
    while (size > min) {
      ctx.font = `${size}px ${serif}`;
      if (ctx.measureText(value).width <= width) return value;
      size--;
    }
    ctx.font = `${size}px ${serif}`;
    const chars = Array.from(value);
    while (chars.length && ctx.measureText(chars.join('') + '…').width > width) chars.pop();
    return chars.join('') + '…';
  }

  function surface(width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    const material = new THREE.MeshStandardMaterial({
      map: texture, roughness: 0.84, metalness: 0.08,
      emissive: 0xffffff, emissiveMap: texture, emissiveIntensity: 0.24,
      polygonOffset: true, polygonOffsetFactor: -1,
    });
    return { canvas, texture, material };
  }

  function draw(record) {
    const summary = summaries.get(record.id);
    const title = summary?.title || text('尚未命名', 'Untitled', '무제');
    const ctx = record.plaque.canvas.getContext('2d');
    ctx.fillStyle = '#bca47d'; ctx.fillRect(0, 0, 624, 420);
    ctx.fillStyle = '#eee8db'; ctx.fillRect(3, 3, 618, 414);
    ctx.fillStyle = '#73614b'; ctx.font = `16px ${sans}`;
    ctx.fillText(`EYTLE   /   ${record.id.replace(/\.[^.]+$/, '').toUpperCase()}`, 38, 53);
    ctx.fillStyle = '#262c2b';
    const heading = fitText(ctx, title, 548, 34, 18);
    ctx.fillText(heading, 38, 114);
    ctx.fillStyle = '#a78b61'; ctx.fillRect(38, 142, 548, 1);
    ctx.font = `22px ${sans}`; ctx.fillStyle = '#4f5652';
    ctx.fillText(text('一个名字，一种看见。', 'A name. Another way to see.', '이름으로 만나는 또 다른 시선.'), 38, 196);
    ctx.font = `18px ${sans}`; ctx.fillStyle = '#6f756d';
    ctx.fillText(text('为画取名 · 点赞 · 留下感想', 'Name · Appreciate · Leave a note', '이름 제안 · 공감 · 감상 나누기'), 38, 238);
    ctx.fillStyle = '#a78b61'; ctx.fillRect(38, 293, 548, 1);
    ctx.font = `18px ${sans}`; ctx.fillStyle = '#554736';
    ctx.fillText(text('点击铭牌，参与这幅画的故事', 'Click to join the conversation', '명패를 눌러 이야기에 참여하세요'), 38, 345);
    ctx.font = `14px ${sans}`; ctx.fillStyle = '#817c70';
    ctx.fillText(text('访客共同题名', 'NAMED BY VISITORS', '관람객이 함께 짓는 이름'), 38, 383);
    record.plaque.texture.needsUpdate = true;

    const label = record.title.canvas.getContext('2d');
    label.fillStyle = '#b9a582'; label.fillRect(0, 0, 864, 138);
    label.fillStyle = '#68573e'; label.fillRect(12, 12, 840, 1); label.fillRect(12, 125, 840, 1);
    label.fillStyle = '#282c29'; label.textAlign = 'center';
    label.fillText(fitText(label, title, 810, 60, 20), 432, 79);
    label.font = `14px ${sans}`; label.fillStyle = '#615643';
    label.fillText(summary?.title
      ? text('访客共同题名', 'VISITORS’ CHOICE', '관람객의 선택')
      : text('等待第一个名字', 'AWAITING A NAME', '첫 이름을 기다립니다'), 432, 108);
    record.title.texture.needsUpdate = true;
  }

  function acquire(id) {
    let record = records.get(id);
    if (!record) {
      record = { id, refs: 0, plaque: surface(624, 420), title: surface(864, 138) };
      records.set(id, record); draw(record);
    }
    record.refs++;
    return record;
  }
  function release(record) {
    if (!record || --record.refs > 0) return;
    for (const item of [record.plaque, record.title]) { item.texture.dispose(); item.material.dispose(); }
    records.delete(record.id);
  }
  function bind(slot, id) {
    if (slot.plaqueRecord?.id === id) return;
    const old = slot.plaqueRecord;
    const record = acquire(id);
    slot.plaqueRecord = record;
    slot.plaque.material = record.plaque.material;
    slot.titlePlaque.material = record.title.material;
    slot.plaque.userData.artworkId = id;
    release(old);
  }
  function attach(slot) {
    const plaque = new THREE.Mesh(plaqueGeometry);
    const title = new THREE.Mesh(titleGeometry);
    // Three's default materials are immediately replaced on bind.
    plaque.material.dispose(); title.material.dispose();
    plaque.userData.kind = 'plaque'; plaque.userData.slot = slot;
    slot.parent.add(plaque, title);
    slot.plaque = plaque; slot.titlePlaque = title;
  }
  function layout(slot, width, frameBorder) {
    const p = plaquePlacement(slot.side, width, frameBorder, slot.frame.position.z, halfWidth);
    slot.plaque.position.set(p.x, p.y, p.z);
    slot.plaque.rotation.y = p.rotationY;
    slot.titlePlaque.position.set(slot.side * (halfWidth - 0.044), 0.61, slot.frame.position.z);
    slot.titlePlaque.rotation.y = p.rotationY;
  }
  function update(summary) {
    if (!summary?.id) return;
    const old = summaries.get(summary.id);
    summaries.set(summary.id, summary);
    // Bound metadata cache independently from the number of works in the archive.
    if (summaries.size > 256) summaries.delete(summaries.keys().next().value);
    if (old?.title === summary.title) return;
    const record = records.get(summary.id);
    if (record) draw(record);
  }
  return { attach, bind, layout, update, residentIds: () => [...records.keys()] };
}

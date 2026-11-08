export function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'value') el.value = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) el.append(kid);
  return el;
}

/** Just enough Markdown for the outline. Builds DOM nodes, so no escaping can be forgotten. */
export function markdown(src) {
  const root = h('div', { class: 'doc' });
  const inline = (text) => {
    const out = [];
    text.split(/(\*\*[^*]+\*\*)/).forEach((part) => {
      if (part.startsWith('**') && part.endsWith('**')) out.push(h('strong', {}, part.slice(2, -2)));
      else if (part) out.push(part);
    });
    return out;
  };
  const lines = src.split('\n');
  for (let i = 0; i < lines.length;) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    const head = /^(#{1,3}) (.*)/.exec(l);
    if (head) { root.append(h(head[1].length === 1 ? 'h2' : 'h3', {}, ...inline(head[2]))); i++; continue; }
    if (l.startsWith('|')) {
      const rows = [];
      while (lines[i]?.startsWith('|')) { rows.push(lines[i].split('|').slice(1, -1).map((c) => c.trim())); i++; }
      const body = rows.slice(2);
      root.append(h('table', {}, h('thead', {}, h('tr', {}, rows[0].map((c) => h('th', {}, ...inline(c))))), h('tbody', {}, body.map((r) => h('tr', {}, r.map((c) => h('td', {}, ...inline(c))))))));
      continue;
    }
    const ordered = /^\d+\. /.test(l);
    if (ordered || l.startsWith('- ')) {
      const list = h(ordered ? 'ol' : 'ul');
      while (lines[i] && (ordered ? /^\d+\. /.test(lines[i]) : lines[i].startsWith('- '))) {
        list.append(h('li', {}, ...inline(lines[i].replace(/^(\d+\. |- )/, '')))); i++;
      }
      root.append(list);
      continue;
    }
    const para = [];
    while (lines[i]?.trim() && !/^(#|\||- |\d+\. )/.test(lines[i])) { para.push(lines[i]); i++; }
    root.append(h('p', {}, ...inline(para.join(' '))));
  }
  return root;
}

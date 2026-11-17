// 地圖標記：照抄 design-system/components/MapMarker.md 的範本函式，改這裡前先對照那份文件。

var DSH_MARKER = {
  size: { tree: [48, 60], beast: [72, 90] },
  anchor: { tree: [24, 55], beast: [36, 84] },
  labels: { ok: '正常', watch: '需關注', notice: '公示中', keep: '保留', move: '移植' }
};

function dshEscape(s) {
  return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
}

function dshMarkerHtml(o) {
  var status = o.status || 'ok';
  var beast = !!o.beastIcon;
  var label = DSH_MARKER.labels[status];
  var svg;
  if (!beast) {
    var ROOF = 'M5 36 Q17.5 32 24 5 Q30.5 32 43 36 Z';
    var marks = {
      watch: '<path class="dsh-marker__mark" d="M24 17 V25"/><circle class="dsh-marker__mark--solid" cx="24" cy="30" r="2"/>',
      keep: '<path class="dsh-marker__mark--solid" d="M24 20 L28 25.5 L24 31 L20 25.5 Z"/>',
      move: '<path class="dsh-marker__mark" d="M18.5 26 H29 M25 22 L29 26 L25 30"/>'
    };
    var stripes = status === 'notice'
      ? '<defs><clipPath id="dsh-roof-clip"><path d="' + ROOF + '"/></clipPath></defs><g class="dsh-marker__stripes" clip-path="url(#dsh-roof-clip)"><path d="M0 24 L18 6 M4 36 L28 12 M12 40 L36 16 M22 40 L44 18 M32 40 L50 22"/></g>'
      : '';
    svg = '<svg class="dsh-marker__shape" viewBox="0 0 48 60" aria-hidden="true">' +
      '<path class="dsh-marker__stem" d="M24 36 V51"/><circle class="dsh-marker__dot" cx="24" cy="55" r="3.5"/>' +
      '<path class="dsh-marker__roof" d="' + ROOF + '"/>' + stripes +
      '<path class="dsh-marker__line" d="' + ROOF + '"/>' +
      '<path class="dsh-marker__ridge" d="M5 36 C2.5 36 1.5 32 1 28 M43 36 C45.5 36 46.5 32 47 28"/>' +
      (marks[status] || '') + '</svg>';
  } else {
    var CAP = 'M10 26 Q26 22 36 4 Q46 22 62 26 Z';
    var bmarks = {
      watch: '<path class="dsh-marker__mark" d="M36 10.5 V17"/><circle class="dsh-marker__mark--solid" cx="36" cy="21" r="1.8"/>',
      keep: '<path class="dsh-marker__mark--solid" d="M36 12 L39 16.5 L36 21 L33 16.5 Z"/>',
      move: '<path class="dsh-marker__mark" d="M31 17 H40 M37 14 L40 17 L37 20"/>'
    };
    var bstripes = status === 'notice'
      ? '<clipPath id="dsh-cap-clip"><path d="' + CAP + '"/></clipPath>'
      : '';
    svg = '<svg class="dsh-marker__shape" viewBox="0 0 72 90" aria-hidden="true">' +
      '<defs><clipPath id="dsh-beast-avatar"><circle cx="36" cy="46" r="21"/></clipPath>' + bstripes + '</defs>' +
      '<path class="dsh-marker__stem" d="M36 75 V80"/><circle class="dsh-marker__dot" cx="36" cy="84" r="4"/>' +
      '<circle class="dsh-marker__halo" cx="36" cy="46" r="29"/>' +
      '<circle class="dsh-marker__avatar-bg" cx="36" cy="46" r="21"/>' +
      '<image href="' + dshEscape(o.beastIcon) + '" x="15" y="25" width="42" height="42" clip-path="url(#dsh-beast-avatar)"/>' +
      '<circle class="dsh-marker__avatar-ring" cx="36" cy="46" r="21"/>' +
      '<path class="dsh-marker__roof" d="' + CAP + '"/>' +
      (status === 'notice' ? '<g class="dsh-marker__stripes" clip-path="url(#dsh-cap-clip)"><path d="M8 26 L28 6 M18 28 L38 8 M28 28 L46 10 M38 28 L56 10 M48 28 L62 14"/></g>' : '') +
      '<path class="dsh-marker__line" d="' + CAP + '"/>' +
      '<path class="dsh-marker__ridge" d="M10 26 C6.5 26 5 21 4.5 17 M62 26 C65.5 26 67 21 67.5 17"/>' +
      '<rect class="dsh-marker__plaque" x="28" y="27" width="16" height="7" rx="1"/>' +
      (bmarks[status] || '') + '</svg>';
  }
  var name = o.name ? dshEscape(o.name) + '，' : '';
  var count = o.count != null ? '<span class="dsh-marker__count" aria-hidden="true">' + dshEscape(o.count) + '</span>' : '';
  return '<span class="dsh-marker dsh-marker--' + status + (beast ? ' dsh-marker--beast' : '') + (o.selected ? ' is-selected' : '') + '"' +
    ' role="img" aria-label="' + name + label + (o.count != null ? '，' + dshEscape(o.count) + ' 位守護' : '') + '">' +
    svg + count + '<span class="dsh-marker__label">' + label + '</span></span>';
}

function dshMarkerIcon(o) {
  var kind = o.beastIcon ? 'beast' : 'tree';
  return L.divIcon({ className: 'dsh-leaflet-icon', html: dshMarkerHtml(o), iconSize: DSH_MARKER.size[kind], iconAnchor: DSH_MARKER.anchor[kind] });
}

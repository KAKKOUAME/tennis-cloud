/* 二维码封装：基于 qrcode-generator（MIT），自动选择版本，输出内联 SVG */
function makeQR(text, opts) {
  opts = opts || {};
  var ec = opts.ec || 'M';
  var cell = opts.cell || 5;
  var margin = (opts.margin != null) ? opts.margin : 4;
  var bg = opts.bg || '#ffffff';
  var fg = opts.fg || '#14181f';
  var qr = qrcode(0, ec); // 0 = 自动版本
  qr.addData(text);
  qr.make();
  var n = qr.getModuleCount();
  var size = (n + margin * 2) * cell;
  var out = [];
  out.push('<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size +
    '" viewBox="0 0 ' + size + ' ' + size + '" shape-rendering="crispEdges" role="img" aria-label="二维码">');
  out.push('<rect width="100%" height="100%" fill="' + bg + '"/>');
  out.push('<g fill="' + fg + '">');
  for (var r = 0; r < n; r++) {
    for (var c = 0; c < n; c++) {
      if (qr.isDark(r, c)) {
        out.push('<rect x="' + ((c + margin) * cell) + '" y="' + ((r + margin) * cell) +
          '" width="' + cell + '" height="' + cell + '"/>');
      }
    }
  }
  out.push('</g></svg>');
  return out.join('');
}

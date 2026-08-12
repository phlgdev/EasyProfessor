// ============================================================
// Plano de Ação EF — Google Apps Script  v3
// ============================================================

// "Azul centáurea, mais claro 3" = #bdd7ee
var COR_CENTAUREA   = '#bdd7ee';
var COR_NOTAS       = '#fff2cc';   // amarelo claro (notas)
var COR_LTS_BG      = '#fce4ec';   // rosa — LTS
var COR_FAB_BG      = '#fff3e0';   // laranja claro — Falta Abonada
var COR_ESP_BG      = '#e8eaf6';   // azul claro — HTP / Regência
var COR_FERIADO_BG  = '#e1f5fe';   // azul mais claro — Feriado
var COR_REUNIAO_BG  = '#ede7f6';   // lilás — Reunião
var COR_FERIAS_BG   = '#e0f7fa';   // ciano claro — Férias
var COR_RECESSO_BG  = '#fce4ec';   // rosa claro — Recesso
var COR_BRANCO      = '#ffffff';

var COR_LABEL_AZUL  = '#000000';   // Turma: / Conteúdo: / Modalidade:
var COR_TEXTO       = '#212121';   // texto normal

var FONTE           = 'Arial';
var TAMANHO         = 10;

// ============================================================
function doPost(e) {
  try {
    var raw  = e.postData.contents || e.postData.getDataAsString();
    var data = JSON.parse(raw);
    var msg  = escreverSemana(data);
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, msg: msg }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, erro: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, msg: 'Script ativo!' }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
function escreverSemana(data) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var mes   = data.mes || 'Plano';
  var sheet = ss.getSheetByName(mes);
  if (!sheet) {
    sheet = ss.insertSheet(mes);
    configurarColunas(sheet);
  }
  var proxLinha = sheet.getLastRow() > 0 ? sheet.getLastRow() + 2 : 1;
  escreverBloco(sheet, proxLinha, data);
  return 'Semana ' + data.num + ' → aba "' + mes + '" linha ' + proxLinha;
}

function configurarColunas(sheet) {
  sheet.setColumnWidth(1, 62);
  for (var c = 2; c <= 6; c++) sheet.setColumnWidth(c, 205);
}

// ============================================================
function escreverBloco(sheet, L, data) {
  var DIAS  = ['Segunda - feira', 'Terça - feira', 'Quarta - feira', 'Quinta - feira', 'Sexta - feira'];
  var AULAS = ['Aula 1', 'Aula 2', 'Aula 3', 'Aula 4', 'Aula 5'];
  var grade   = data.grade   || [];
  var notas   = data.notas   || {};
  var horario = data.horario || [];
  var datas   = calcularDatas(data.inicio);

  // ── Linha 1: Professor / Ciclo / Mês ──────────────────────
  var rCab = sheet.getRange(L, 1, 1, 6);
  rCab.merge();
  rCab.setValue('PROFESSOR(A): ' + (data.professor || 'Professor') + '          * ' + (data.ciclo || 'I CICLO') + '          MÊS: ' + (data.mes || ''));
  aplicarEstilo(rCab, COR_CENTAUREA, true, TAMANHO, '#000000', 'left');
  sheet.setRowHeight(L, 24);
  L++;

  // ── Linha 2: Dias da semana ────────────────────────────────
  sheet.getRange(L, 1).setValue('').setBackground(COR_CENTAUREA);
  for (var di = 0; di < 5; di++) {
    var rDia = sheet.getRange(L, di + 2);
    rDia.setValue(DIAS[di] + ' ' + datas[di]);
    aplicarEstilo(rDia, COR_CENTAUREA, true, TAMANHO, '#000000', 'center');
  }
  sheet.getRange(L, 1, 1, 6)
    .setBorder(true, true, true, true, true, true, '#9e9e9e', SpreadsheetApp.BorderStyle.SOLID);
  sheet.setRowHeight(L, 22);
  L++;

  // ── Linhas 3–7: Aulas 1 a 5 ───────────────────────────────
  for (var ai = 0; ai < 5; ai++) {
    // Label "Aula X" — lateral azul centáurea
    var rLabel = sheet.getRange(L, 1);
    rLabel.setValue(AULAS[ai]);
    aplicarEstilo(rLabel, COR_CENTAUREA, true, TAMANHO, '#000000', 'center');
    rLabel.setVerticalAlignment('middle');

    // Células de cada dia
    for (var di2 = 0; di2 < 5; di2++) {
      var cel  = (grade[di2] || [])[ai] || null;
      var cell = sheet.getRange(L, di2 + 2);
      var tipo = cel ? cel.tipo : null;
      var hfix = (horario[di2] || [])[ai];

      if (!cel || tipo === undefined) {
        if (hfix === 'HTP')      { escreverSimples(cell, 'HTP',      COR_ESP_BG);     continue; }
        if (hfix === 'REGENCIA') { escreverSimples(cell, 'Regência', COR_ESP_BG);     continue; }
        escreverSimples(cell, '', COR_BRANCO);
        continue;
      }
      if (tipo === 'htp')           { escreverSimples(cell, 'HTP',                             COR_ESP_BG);     continue; }
      if (tipo === 'regencia')      { escreverSimples(cell, 'Regência',                        COR_ESP_BG);     continue; }
      if (tipo === 'feriado')       { escreverSimples(cell, 'FERIADO' + (cel.texto ? ' — ' + cel.texto : ''), COR_FERIADO_BG); continue; }
      if (tipo === 'ferias')        { escreverSimples(cell, '🏖️ ' + (cel.texto || 'FÉRIAS'),   COR_FERIAS_BG);  continue; }
      if (tipo === 'recesso')       { escreverSimples(cell, '🎉 ' + (cel.texto || 'RECESSO'),  COR_RECESSO_BG); continue; }
      if (tipo === 'lts' || tipo === 'falta') { escreverSimples(cell, 'LTS',                  COR_LTS_BG);     continue; }
      if (tipo === 'falta_abonada') { escreverSimples(cell, 'FALTA ABONADA',                  COR_FAB_BG);     continue; }
      if (tipo === 'reuniao')       { escreverSimples(cell, 'REUNIÃO PEDAGÓGICA',              COR_REUNIAO_BG); continue; }
      if (tipo === 'livre')         { escreverSimples(cell, cel.texto || '',                   COR_BRANCO);     continue; }

      // Aula normal — rich text com labels negrito azul + valores normal
      escreverAulaNormal(cell, cel);
    }

    // Bordas da linha inteira
    sheet.getRange(L, 1, 1, 6)
      .setBorder(true, true, true, true, true, true, '#9e9e9e', SpreadsheetApp.BorderStyle.SOLID);
    sheet.setRowHeight(L, 85);
    L++;
  }

  // ── Notas semanais ─────────────────────────────────────────
  var secoes = [
    ['Objetivos semanais: ',                    notas.objetivos || ''],
    ['Avaliação semanal do professor: ',         notas.avaliacao || ''],
    ['* Flexibilização/ Adaptação: Objetivo: ', notas.flex      || ''],
    ['Devolutiva da gestão: ',                   notas.gestao    || ''],
  ];

  secoes.forEach(function(par) {
    var rN = sheet.getRange(L, 1, 1, 6);
    rN.merge();

    var lbl = par[0], val = par[1], full = lbl + val;
    var rtb = SpreadsheetApp.newRichTextValue().setText(full);

    var stBold   = SpreadsheetApp.newTextStyle().setBold(true).setFontFamily(FONTE).setFontSize(TAMANHO).setForegroundColor('#000000').build();
    var stNormal = SpreadsheetApp.newTextStyle().setBold(false).setFontFamily(FONTE).setFontSize(TAMANHO).setForegroundColor(COR_TEXTO).build();

    rtb.setTextStyle(0, lbl.length, stBold);
    if (val.length > 0) rtb.setTextStyle(lbl.length, full.length, stNormal);

    rN.setRichTextValue(rtb.build());
    rN.setBackground(COR_NOTAS)
       .setWrap(true)
       .setVerticalAlignment('top')
       .setBorder(true, true, true, true, false, false, '#9e9e9e', SpreadsheetApp.BorderStyle.SOLID);
    sheet.setRowHeight(L, 48);
    L++;
  });

  // Espaço entre semanas
  sheet.setRowHeight(L, 12);
}

// ============================================================
function escreverSimples(cell, texto, bg) {
  cell.setValue(texto)
      .setBackground(bg)
      .setFontFamily(FONTE)
      .setFontSize(TAMANHO)
      .setFontWeight(texto && texto !== '' ? 'bold' : 'normal')
      .setHorizontalAlignment('center')
      .setVerticalAlignment('middle')
      .setWrap(true);
}

function escreverAulaNormal(cell, cel) {
  var t = cel.turma      || '';
  var c = cel.conteudo   || '';
  var m = cel.modalidade || '';
  var o = cel.obs        || '';

  var L1 = 'Turma: ';
  var L2 = '\nConteúdo: ';
  var L3 = '\nModalidade Organizativa: ';
  var L4 = o ? '\n' + o : '';
  var full = L1 + t + L2 + c + L3 + m + L4;

  var stLabel  = SpreadsheetApp.newTextStyle()
    .setBold(true).setFontFamily(FONTE).setFontSize(TAMANHO)
    .setForegroundColor(COR_LABEL_AZUL).build();
  var stNormal = SpreadsheetApp.newTextStyle()
    .setBold(false).setFontFamily(FONTE).setFontSize(TAMANHO)
    .setForegroundColor(COR_TEXTO).build();

  var rtb = SpreadsheetApp.newRichTextValue().setText(full);

  // Label "Turma: "
  var p0 = 0;
  rtb.setTextStyle(p0, p0 + L1.length, stLabel);
  rtb.setTextStyle(p0 + L1.length, p0 + L1.length + t.length, stNormal);

  // Label "Conteúdo: "
  var p1 = L1.length + t.length;
  rtb.setTextStyle(p1, p1 + L2.length, stLabel);
  rtb.setTextStyle(p1 + L2.length, p1 + L2.length + c.length, stNormal);

  // Label "Modalidade Organizativa: "
  var p2 = p1 + L2.length + c.length;
  rtb.setTextStyle(p2, p2 + L3.length, stLabel);
  rtb.setTextStyle(p2 + L3.length, p2 + L3.length + m.length, stNormal);

  // Obs (se houver)
  if (o) {
    var p3 = p2 + L3.length + m.length;
    rtb.setTextStyle(p3, full.length, stNormal);
  }

  cell.setRichTextValue(rtb.build());
  cell.setBackground(COR_BRANCO)
      .setWrap(true)
      .setVerticalAlignment('top');
}

function aplicarEstilo(range, bg, bold, size, cor, align) {
  range.setBackground(bg)
       .setFontFamily(FONTE)
       .setFontSize(size)
       .setFontWeight(bold ? 'bold' : 'normal')
       .setFontColor(cor)
       .setHorizontalAlignment(align || 'left')
       .setWrap(true);
}

// ============================================================
function calcularDatas(isoInicio) {
  var datas = [];
  if (!isoInicio) { for (var i = 0; i < 5; i++) datas.push('__/__'); return datas; }
  var d = new Date(isoInicio + 'T12:00:00');
  for (var i = 0; i < 5; i++) {
    datas.push(d.getDate() + '/' + (d.getMonth() + 1));
    d.setDate(d.getDate() + 1);
  }
  return datas;
}

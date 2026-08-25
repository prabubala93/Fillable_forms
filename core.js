/* UIIC Forms — shared framework
   Provides: element builder, common field/table/signature components,
   and PDF export (html2canvas + jsPDF, multi-page A4). */

const UIIC = (() => {

  /* ---------- tiny DOM helper ---------- */
  function el(tag, attrs = {}, kids = []) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k === 'html') n.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
      else if (v !== undefined && v !== null) n.setAttribute(k, v);
    }
    (Array.isArray(kids) ? kids : [kids]).forEach(k => {
      if (k === undefined || k === null) return;
      n.appendChild(typeof k === 'string' ? document.createTextNode(k) : k);
    });
    return n;
  }

  /* ---------- letterhead / title / footer ---------- */
  function letterhead() {
    return el('div', { class: 'letterhead' }, [
      el('div', {}, [
        el('div', { class: 'company', text: 'United India Insurance Company Limited' }),
        el('div', { class: 'addr', html: 'Corporate Identity Number: U93090TN1938GOI000108<br>Registered Office: 24 Whites Road, Chennai \u2013 600014 &nbsp;|&nbsp; IRDAI Reg. No. 545' })
      ]),
      el('div', { class: 'mark', text: 'UIIC' })
    ]);
  }

  function titleBlock(title, subtitle, urn) {
    const wrap = el('div', {}, [
      el('div', { class: 'form-title' }, [
        el('h1', { text: title }),
        subtitle ? el('h2', { text: subtitle }) : null
      ])
    ]);
    if (urn) wrap.appendChild(el('div', { class: 'urn', text: 'URN: ' + urn }));
    return wrap;
  }

  function instructions(items, heading = 'Important Instructions') {
    return el('div', { class: 'instructions' }, [
      el('div', { class: 'head', text: heading }),
      el('ul', {}, items.map(t => el('li', { text: t })))
    ]);
  }

  function footer(title, urn, page) {
    return el('div', { class: 'foot' }, [
      el('span', { text: title + (urn ? ' \u2014 URN: ' + urn : '') }),
      el('span', { text: page || '' })
    ]);
  }

  /* ---------- sections ---------- */
  function block(titleText, note) {
    const s = el('section', { class: 'block' });
    s.appendChild(el('div', { class: 'block-title', text: titleText }));
    if (note) s.appendChild(el('div', { class: 'block-note', text: note }));
    return s;
  }

  /* ---------- fields ---------- */
  function field(labelText, opts = {}) {
    const width = opts.width ? ' w-' + opts.width : '';
    const type = opts.type || 'text';
    const wrap = el('div', { class: 'field' + width });
    wrap.appendChild(el('label', { text: labelText }));
    if (type === 'textarea') {
      wrap.appendChild(el('textarea', { rows: opts.rows || 2 }));
    } else {
      wrap.appendChild(el('input', { type, placeholder: opts.placeholder || '' }));
    }
    return wrap;
  }

  function grid(fields) {
    return el('div', { class: 'grid' }, fields);
  }

  function checkGroup(labelText, options, opts = {}) {
    const wrap = el('div', { class: 'field' + (opts.width ? ' w-' + opts.width : '') });
    if (labelText) wrap.appendChild(el('label', { text: labelText }));
    const row = el('div', { class: 'checks' });
    options.forEach(optLabel => {
      row.appendChild(el('label', { class: 'chk' }, [
        el('input', { type: 'checkbox' }),
        document.createTextNode(optLabel)
      ]));
    });
    wrap.appendChild(row);
    return wrap;
  }

  /* ---------- generic table ----------
     spec = { headers:[...], rows:[ [cellSpec,...], ... ] }
     cellSpec: string | {input:true} | {yn:true} | {label:true,text:''} */
  function cell(spec) {
    if (typeof spec === 'string') return el('td', { text: spec });
    if (spec.label) return el('td', { class: 'label-col', text: spec.text || '' });
    if (spec.input) return el('td', {}, el('input', { type: spec.dtype || 'text' }));
    if (spec.yn) {
      const c = el('td');
      const wrap = el('div', { class: 'yn' });
      wrap.appendChild(el('label', {}, [el('input', { type: 'checkbox' }), 'Y']));
      wrap.appendChild(el('label', {}, [el('input', { type: 'checkbox' }), 'N']));
      c.appendChild(wrap);
      return c;
    }
    if (spec.blank) return el('td', {});
    return el('td', { text: '' });
  }

  function table(spec) {
    const t = el('table', { class: 'formtable' });
    if (spec.headers) {
      const thead = el('thead');
      thead.appendChild(el('tr', {}, spec.headers.map(h => el('th', { text: h }))));
      t.appendChild(thead);
    }
    const tbody = el('tbody');
    spec.rows.forEach(r => tbody.appendChild(el('tr', {}, r.map(cell))));
    t.appendChild(tbody);
    const scroller = el('div', { class: 'table-scroll' }, t);
    return scroller;
  }

  /* ---------- declarations ---------- */
  function declarations(items) {
    return el('div', { class: 'declaration-list' },
      items.map(t => el('label', { class: 'decl-item' }, [
        el('input', { type: 'checkbox' }),
        el('span', { text: t })
      ]))
    );
  }

  function legalBox(html) {
    return el('div', { class: 'legal', html });
  }

  /* ---------- signature pad ---------- */
  let sigCounter = 0;
  function signaturePad(labelText) {
    sigCounter++;
    const id = 'sig_' + sigCounter + '_' + Math.random().toString(36).slice(2, 7);
    const box = el('div', { class: 'sig-box' });
    box.appendChild(el('label', { text: labelText }));
    const canvas = el('canvas', { class: 'sigpad', id, width: 400, height: 100 });
    box.appendChild(canvas);
    const tools = el('div', { class: 'sig-tools' });
    const clearBtn = el('button', { type: 'button', text: 'Clear' });
    tools.appendChild(clearBtn);
    box.appendChild(tools);

    requestAnimationFrame(() => initSigPad(canvas, clearBtn));
    return box;
  }

  function initSigPad(canvas, clearBtn) {
    const ctx = canvas.getContext('2d');
    function resize() {
      const rect = canvas.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      const prev = canvas.toDataURL();
      canvas.width = rect.width * ratio;
      canvas.height = rect.height * ratio;
      ctx.scale(ratio, ratio);
      ctx.lineWidth = 1.6;
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#173a63';
    }
    resize();
    let drawing = false, last = null;
    function pos(e) {
      const rect = canvas.getBoundingClientRect();
      const p = e.touches ? e.touches[0] : e;
      return { x: p.clientX - rect.left, y: p.clientY - rect.top };
    }
    function start(e) { drawing = true; last = pos(e); e.preventDefault(); }
    function move(e) {
      if (!drawing) return;
      const p = pos(e);
      ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke();
      last = p; e.preventDefault();
    }
    function end() { drawing = false; }
    canvas.addEventListener('mousedown', start);
    canvas.addEventListener('mousemove', move);
    window.addEventListener('mouseup', end);
    canvas.addEventListener('touchstart', start, { passive: false });
    canvas.addEventListener('touchmove', move, { passive: false });
    canvas.addEventListener('touchend', end);
    clearBtn.addEventListener('click', () => ctx.clearRect(0, 0, canvas.width, canvas.height));
  }

  /* ---------- multi-person block helpers (health forms) ---------- */
  const PERSON_HEADERS = ['', '1st Insured', '2nd Insured', '3rd Insured', '4th Insured', '5th Insured', '6th Insured'];

  function insuredPersonsTable(opts = {}) {
    const rows = [
      [{ label: true, text: 'Name' }, ...Array(6).fill({ input: true })],
      [{ label: true, text: 'Date of Birth' }, ...Array(6).fill({ input: true, dtype: 'date' })],
      [{ label: true, text: 'Gender (M/F/O)' }, ...Array(6).fill({ input: true })],
      [{ label: true, text: 'Marital Status' }, ...Array(6).fill({ input: true })],
    ];
    if (opts.abha) rows.push([{ label: true, text: 'ABHA ID' }, ...Array(6).fill({ input: true })]);
    rows.push([{ label: true, text: 'Occupation' }, ...Array(6).fill({ input: true })]);
    rows.push([{ label: true, text: 'Aadhaar No.' }, ...Array(6).fill({ input: true })]);
    rows.push([{ label: true, text: 'Sum Insured' + (opts.indBasis ? ' (Ind Basis)' : '') }, ...Array(6).fill({ input: true })]);
    if (opts.threshold) rows.push([{ label: true, text: 'Threshold (Ind Basis)' }, ...Array(6).fill({ input: true })]);
    rows.push([{ label: true, text: 'Height (cm)' }, ...Array(6).fill({ input: true })]);
    rows.push([{ label: true, text: 'Weight (kg)' }, ...Array(6).fill({ input: true })]);
    rows.push([{ label: true, text: 'Blood Group' }, ...Array(6).fill({ input: true })]);
    rows.push([{ label: true, text: 'Relation with Proposer' }, ...Array(6).fill({ input: true })]);
    rows.push([{ label: true, text: 'Dependent (Y/N)' }, ...Array(6).fill({ input: true })]);
    return table({ headers: PERSON_HEADERS, rows });
  }

  function photoSignatureRow() {
    const t = el('table', { class: 'formtable' });
    const heads = ['1st', '2nd', '3rd', '4th', '5th', '6th'].map(n => n + ' Insured Person\u2019s Photo');
    t.appendChild(el('tr', {}, heads.map(h => el('td', { text: h, style: 'height:60px;text-align:center;color:#999;font-size:.62rem;' }))));
    t.appendChild(el('tr', {}, Array(6).fill(0).map(() => el('td', { text: 'Signature', style: 'text-align:center;color:#999;font-size:.62rem;' }))));
    return el('div', { class: 'table-scroll' }, t);
  }

  function existingCoverTable(opts = {}) {
    const rows = [
      [{ label: true, text: 'Company' }, ...Array(6).fill({ input: true })],
      [{ label: true, text: 'Policy No.' }, ...Array(6).fill({ input: true })],
      [{ label: true, text: 'Policy Type (Base/Top-up)' }, ...Array(6).fill({ input: true })],
      [{ label: true, text: 'Expiry Date' }, ...Array(6).fill({ input: true, dtype: 'date' })],
      [{ label: true, text: 'Sum Insured' }, ...Array(6).fill({ input: true })],
    ];
    if (opts.threshold) rows.push([{ label: true, text: 'Threshold' }, ...Array(6).fill({ input: true })]);
    rows.push([{ label: true, text: 'Servicing TPA' }, ...Array(6).fill({ input: true })]);
    rows.push([{ label: true, text: 'Last Claimed Date' }, ...Array(6).fill({ input: true, dtype: 'date' })]);
    rows.push([{ label: true, text: 'Claimed Amount' }, ...Array(6).fill({ input: true })]);
    rows.push([{ label: true, text: 'Porting/Migrating' }, ...Array(6).fill({ input: true })]);
    return table({ headers: PERSON_HEADERS, rows });
  }

  const LIFESTYLE_ROWS = ['Alcohol', 'Tobacco (Bidi/Cigarette/E-Cigarette/Gutkha/Pan Masala, etc.)'];
  const COND1_ROWS = [
    'Genetic Disorder, Malignant Cancer, Chronic Condition, HIV/AIDS',
    'Acid Attack, Anaemia, Asthma, Blindness, Mental illness, Diabetes Mellitus, Hypertension, Renal stones, Epilepsy, Chronic neurological conditions, Parkinson\u2019s Disease, Multiple Sclerosis, Muscular Dystrophy, Cerebral palsy, Sickle Cell Disease, Thalassemia, Haemophilia, Low vision, Hearing Impairment, Dwarfism, Autism Spectrum disorder, Leprosy cured person, Specific Learning Disability, Speech & Language Disability, Intellectual disability, locomotor disability'
  ];
  const COND2_ROWS = [
    'Any disorder/disease of the stomach, Intestine, Liver, Gall bladder, Pancreas, Kidney (except Renal Stones), Urinary Bladder, Urinary Tract',
    'Blood Disorder, Venereal Diseases (other than above), Hyperthyroidism, Hypothyroidism, Dyslipidaemia (High cholesterol)',
    'Cataract or other diseases of the eye',
    'Disease of Bones/Joint including arthritis, rheumatic pain, slipped disc, spinal disorder, injury to Ligaments or Paralysis',
    'Disease of Fistula/Prostrate, Piles, Hernia, Varicose veins',
    'Disease of Cardiovascular system, heart disease (Chest Pain, Coronary Insufficiency, Myocardial Infarction, etc.)',
    'ENT Disease, Respiratory or Allergic Disease (Tuberculosis, Bronchitis, Pneumonia, COPD etc) other than Asthma',
    'Gynaecological disorder such as DUB, Fibroid Uterus, Prolapsed Uterus, Ovarian cyst or breast or any specific gynaecological disorders or caesarean/Hysterectomy',
    'Disease of Central Nervous System (other than those mentioned above)',
    'Psychiatric Disorder (other than those mentioned above), Thyroiditis/Goitre',
    'Benign Tumor, Pre-cancerous Lesion, Ulcer, boil, cyst or wound etc. which does not heal or improve despite treatment'
  ];
  const OTHER_ROWS = [
    'More than two Hospitalization in previous two years (except vector/air/water-borne <5 days) OR any Surgery/Treatment/investigation planned or pending',
    'Pain >7 days in any part of body OR restriction of movement OR difficulty swallowing/breathing OR difficulty in daily activities OR persistent headache/cough/bleeding >5 days',
    'Currently taking prescription medications or undergoing ongoing medical treatment'
  ];

  function ynTableRows(items) {
    return items.map(txt => [{ label: true, text: txt }, ...Array(6).fill({ yn: true })]);
  }

  function medicalInformationBlock() {
    const wrap = el('div');
    wrap.appendChild(el('div', { class: 'block-note', text: 'Medical History of the person(s) proposed for Insurance. Tick Yes/No. Do not leave blank.' }));
    wrap.appendChild(el('div', { style: 'font-weight:700;font-size:.72rem;margin-top:6px;', text: 'Lifestyle Questionnaire \u2014 does any person consume:' }));
    wrap.appendChild(table({ headers: PERSON_HEADERS, rows: ynTableRows(LIFESTYLE_ROWS) }));
    wrap.appendChild(el('div', { style: 'font-weight:700;font-size:.72rem;margin-top:8px;', text: 'Specific Condition Questionnaire \u2013 I: ever suffered from / suffering from any of the following?' }));
    wrap.appendChild(table({ headers: PERSON_HEADERS, rows: ynTableRows(COND1_ROWS) }));
    wrap.appendChild(el('div', { style: 'font-weight:700;font-size:.72rem;margin-top:8px;', text: 'Specific Condition Questionnaire \u2013 II' }));
    wrap.appendChild(table({ headers: PERSON_HEADERS, rows: ynTableRows(COND2_ROWS) }));
    wrap.appendChild(el('div', { style: 'font-weight:700;font-size:.72rem;margin-top:8px;', text: 'Other Medical Questionnaire' }));
    wrap.appendChild(table({ headers: PERSON_HEADERS, rows: ynTableRows(OTHER_ROWS) }));
    wrap.appendChild(el('div', { class: 'block-note', text: 'If \u2018Yes\u2019 to any question above, give details below (name, illness(es), date of last consultation, treatment, doctor, hospital & phone, present status) and submit Annexure A & B.' }));
    wrap.appendChild(table({
      headers: ['Name of Person', 'Illness(es)', 'Date of Last Consultation', 'Treatment(s) Undergone', 'Treating Doctor', 'Hospital Name & Phone', 'Present Status'],
      rows: Array(4).fill(0).map(() => Array(7).fill({ input: true }))
    }));
    return wrap;
  }

  function pastProposalsAndPayment() {
    const wrap = el('div');
    wrap.appendChild(checkGroup('Has any proposal for life/health/critical illness insurance for any insured person ever been declined, postponed, loaded, or made subject to special conditions by any insurer?', ['Yes', 'No']));
    return wrap;
  }

  function paymentDetailsBlock() {
    return grid([
      field('Premium Amount (\u20b9)', { width: 'third' }),
      field('Premium Amount (in words)', { width: 'half' }),
      field('Cheque/DD No.', { width: 'quarter' }),
      checkGroup('Premium Payment Mode', ['Cash', 'Cheque', 'DD', 'Credit/Debit Card', 'ECS'], { width: 'full' }),
      field('Date', { type: 'date', width: 'quarter' })
    ]);
  }

  function bankRefundBlock() {
    return grid([
      field('Bank Name', { width: 'half' }),
      field('Branch Address', { width: 'half' }),
      field('Bank Account No.', { width: 'half' }),
      field('IFS Code', { width: 'half' }),
      checkGroup('Receive policy document in physical form (in addition to e-copy)?', ['Yes', 'No'], { width: 'full' })
    ]);
  }

  const STANDARD_DECLARATIONS = [
    'I hereby declare, on my behalf and on behalf of all persons proposed to be insured, that the above statements, answers and/or particulars are true and complete to the best of my knowledge and that I am authorized to propose on behalf of these other persons.',
    'I understand that the information provided will form the basis of the insurance policy, is subject to the board-approved underwriting policy of the insurer, and that the policy will come into force only after requisite receipt.',
    'I will notify in writing of any change occurring in the occupation or general health of the life to be insured/proposer after the proposal is submitted but before communication of risk acceptance by the company.',
    'I consent to the company seeking medical information from any doctor/hospital who has attended the insured/proposer, or from any past/present employer, or from any insurer to whom an application for insurance has been made, for underwriting and/or claim settlement.',
    'I authorize the company to share information pertaining to my proposal, including medical records, for underwriting and/or claims settlement with any Governmental and/or Regulatory authority.',
    'Ayushman Bharat Health Account (ABHA) Declaration: I authorize the company to access my/our ABHA information including medical records for underwriting and/or claims settlement and to share the same with TPAs, service providers and/or regulatory authorities as required by law.',
    'I confirm that the source of funds for the premium paid under this policy is legal.'
  ];

  function proposerDeclarationBlock(extra = []) {
    const wrap = el('div');
    wrap.appendChild(declarations(STANDARD_DECLARATIONS.concat(extra)));
    wrap.appendChild(grid([
      field('Date', { type: 'date', width: 'third' }),
      field('Place', { width: 'third' })
    ]));
    wrap.appendChild(el('div', { class: 'sig-row' }, [
      signaturePad('Signature of the Proposer'),
    ]));
    wrap.appendChild(field('Name of the Proposer (in BLOCK letters)', { width: 'full' }));
    return wrap;
  }

  function illiterateProposerCertificate() {
    const wrap = el('div');
    wrap.appendChild(el('div', { class: 'block-note', text: 'To be completed if the Proposal Form is not filled by the proposer, or the proposer signs in a vernacular language / is illiterate. The contents have been fully explained to the proposer, who is willing to accept the coverage subject to the terms, conditions and exceptions of the Company.' }));
    wrap.appendChild(grid([
      field('Date', { type: 'date', width: 'third' }),
      field('Place', { width: 'third' }),
      field('Name of Representative (BLOCK letters)', { width: 'third' })
    ]));
    wrap.appendChild(el('div', { class: 'sig-row' }, [signaturePad('Signature of the Representative')]));
    return wrap;
  }

  function intermediaryDeclarationBlock() {
    const wrap = el('div');
    wrap.appendChild(el('div', { class: 'block-note', text: 'I/We confirm that I/We have explained the product features to the proposer and its suitability to him/her and other insured persons.' }));
    wrap.appendChild(grid([
      field('Date', { type: 'date', width: 'third' }),
      field('Place', { width: 'third' })
    ]));
    wrap.appendChild(el('div', { class: 'sig-row' }, [signaturePad('Signature of Intermediary')]));
    return wrap;
  }

  function statutoryWarningBlock() {
    return legalBox(
      '<strong>Section 41, Insurance Act 1938 \u2013 Prohibition of Rebates</strong><ul>' +
      '<li>No person shall allow or offer to allow, directly or indirectly, any rebate of premium or commission as an inducement to take out, renew or continue an insurance policy, except such rebate as may be allowed in accordance with the published prospectus or tables of the insurer.</li>' +
      '<li>Any person contravening this section is punishable with a fine which may extend to ten lakh rupees.</li></ul>'
    );
  }

  function officeUseBlock() {
    const wrap = el('div');
    wrap.appendChild(grid([
      field('Gross Premium', { width: 'third' }),
      field('Premium for Optional Cover', { width: 'third' }),
      field('Net Premium', { width: 'third' }),
      field('Intermediary Code', { width: 'half' }),
      field('Development Officer Code', { width: 'half' })
    ]));
    return wrap;
  }

  /* ---------- PDF export (html2canvas + jsPDF, multi-page A4) ---------- */
  async function exportToPDF(containerId, filename, statusElId) {
    const statusEl = statusElId ? document.getElementById(statusElId) : null;
    const set = (t) => { if (statusEl) statusEl.textContent = t; };
    try {
      set('Rendering\u2026');
      const src = document.getElementById(containerId);
      // temporarily neutralize the box-shadow for a clean capture
      const prevShadow = src.style.boxShadow;
      src.style.boxShadow = 'none';
      const canvas = await html2canvas(src, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
      src.style.boxShadow = prevShadow;

      set('Building PDF\u2026');
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const imgW = pageW;
      const imgH = (canvas.height * imgW) / canvas.width;

      if (imgH <= pageH) {
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, imgW, imgH);
      } else {
        // slice tall canvas into page-height chunks
        const pageCanvasHeightPx = Math.floor((pageH * canvas.width) / imgW);
        let renderedPx = 0;
        let first = true;
        while (renderedPx < canvas.height) {
          const sliceH = Math.min(pageCanvasHeightPx, canvas.height - renderedPx);
          const pageCanvas = document.createElement('canvas');
          pageCanvas.width = canvas.width;
          pageCanvas.height = sliceH;
          const ctx = pageCanvas.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
          ctx.drawImage(canvas, 0, renderedPx, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
          const sliceImgH = (sliceH * imgW) / canvas.width;
          if (!first) pdf.addPage();
          pdf.addImage(pageCanvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, imgW, sliceImgH);
          renderedPx += sliceH;
          first = false;
        }
      }
      pdf.save(filename);
      set('PDF downloaded \u2713');
      setTimeout(() => set(''), 2500);
    } catch (err) {
      console.error(err);
      set('Error \u2014 see console');
    }
  }

  function bindToolbar(containerId, filename, statusElId) {
    const btn = document.getElementById('downloadBtn');
    if (btn) btn.addEventListener('click', () => exportToPDF(containerId, filename, statusElId));
  }

  return {
    el, letterhead, titleBlock, instructions, footer, block, field, grid, checkGroup,
    table, declarations, legalBox, signaturePad, insuredPersonsTable, photoSignatureRow,
    existingCoverTable, medicalInformationBlock, pastProposalsAndPayment, paymentDetailsBlock,
    bankRefundBlock, proposerDeclarationBlock, illiterateProposerCertificate,
    intermediaryDeclarationBlock, statutoryWarningBlock, officeUseBlock,
    exportToPDF, bindToolbar
  };
})();

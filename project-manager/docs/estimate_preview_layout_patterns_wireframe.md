# 見積プレビュー「明細少・中央余白」レイアウト ワイヤー

以下の `html` コードブロックを **`estimate_preview_layout_patterns_wireframe.html`** として保存し、ブラウザで直接開いてください。  
（Next の `/docs` は静的配信外のため。）

Agent モードに切り替えれば、同内容を `.html` としてリポジトリに直接配置できます。

## 比較サマリ

| パターン | 要約 |
|----------|------|
| **A** | 用紙高を固定し、中間の **flex 伸長ゾーン**で余白を受け、フッタを下端に集約。 |
| **B** | A に加え、伸長帯に **極薄グラデ**（print ではオフ想定）。 |
| **C** | プレビューは **内容高さのみ**（A4 固定しない）。大きな中間空白は出にくい。 |
| **D** | **プレビュー限定**の短い注記枠。乱用注意。 |

---

```html
<!DOCTYPE html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>見積プレビュー「明細少・中央余白」レイアウトパターン別ワイヤー</title>
    <style>
      :root {
        --ink: #1a1a1a;
        --muted: #6b7280;
        --header-bg: #333333;
        --header-fg: #ffffff;
        --bar-bg: #e8e8e8;
        --stripe: #f7f7f7;
        --border: #0f172a;
        --sheet-bg: #ffffff;
        --page-bg: #e2e8f0;
        --grow-hatch: repeating-linear-gradient(-45deg, #f1f5f9, #f1f5f9 4px, #e2e8f0 4px, #e2e8f0 8px);
        --grow-label: #64748b;
      }
      html { box-sizing: border-box; scroll-behavior: smooth; }
      *, *::before, *::after { box-sizing: inherit; }
      body {
        margin: 0; padding: 0 16px 48px;
        font-family: system-ui, "Segoe UI", "Hiragino Sans", "Noto Sans JP", sans-serif;
        font-size: 14px; color: var(--ink); background: #f8fafc; line-height: 1.55;
        max-width: 920px; margin-left: auto; margin-right: auto;
      }
      h1 { font-size: 1.5rem; font-weight: 700; margin: 1.25rem 0 0.5rem; }
      .doc-lead { color: var(--muted); font-size: 0.9rem; margin: 0 0 1.25rem; }
      .scope-note {
        font-size: 0.8rem; color: #92400e; background: #fffbeb; border: 1px solid #fcd34d;
        border-radius: 6px; padding: 10px 12px; margin-bottom: 1.5rem;
      }
      .toc { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 18px; margin-bottom: 1.5rem; }
      .toc h2 { font-size: 0.85rem; margin: 0 0 10px; color: var(--muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; }
      .toc ol { margin: 0; padding-left: 1.25rem; }
      .toc a { color: #1d4ed8; text-decoration: none; }
      .toc a:hover { text-decoration: underline; }
      .compare { width: 100%; border-collapse: collapse; font-size: 0.8rem; background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; margin-bottom: 2rem; }
      .compare th, .compare td { border: 1px solid #e2e8f0; padding: 8px 10px; vertical-align: top; text-align: left; }
      .compare thead th { background: #f1f5f9; font-weight: 600; width: 8em; }
      .compare tbody th { background: #fafafa; font-weight: 600; width: 8.5em; white-space: nowrap; }
      section.pattern { border-top: 2px solid #cbd5e1; padding-top: 1.75rem; margin-top: 1.75rem; }
      section.pattern:first-of-type { border-top: none; padding-top: 0; margin-top: 0; }
      section.pattern h2 { font-size: 1.15rem; margin: 0 0 0.5rem; }
      .pattern-id { display: inline-block; font-size: 0.7rem; font-weight: 700; letter-spacing: 0.04em; color: #fff; background: #334155; padding: 2px 8px; border-radius: 4px; margin-right: 6px; vertical-align: middle; }
      .purpose { margin: 0 0 1rem; color: #334155; }
      .mini-label { font-size: 0.75rem; font-weight: 600; color: var(--muted); margin: 0 0 8px; }
      .wire-outer { background: var(--page-bg); padding: 16px; border-radius: 8px; margin-bottom: 1rem; overflow: auto; }
      .wire-sheet { width: 100%; max-width: 210mm; margin: 0 auto; padding: 8mm 6mm; background: var(--sheet-bg); box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12); border: 1px solid #e2e8f0; }
      .wire-block-title { text-align: center; font-size: 11px; font-weight: 700; margin: 0 0 8px; color: #0f172a; }
      .wire-hdr { display: flex; justify-content: space-between; gap: 8px; font-size: 8px; margin-bottom: 8px; color: var(--muted); border-bottom: 1px dashed #cbd5e1; padding-bottom: 6px; }
      .wire-total { background: var(--bar-bg); border: 1px solid #ccc; padding: 4px 8px; font-size: 9px; font-weight: 600; margin-bottom: 6px; text-align: right; }
      .wire-table { width: 100%; border-collapse: collapse; font-size: 7px; margin-bottom: 0; }
      .wire-table th, .wire-table td { border: 1px solid var(--border); padding: 2px 4px; }
      .wire-table thead th { background: var(--header-bg); color: var(--header-fg); text-align: center; }
      .wire-table tbody tr:nth-child(even) { background: var(--stripe); }
      .wire-tax { display: flex; border: 1px solid var(--border); border-top: none; font-size: 7px; text-align: center; font-weight: 600; margin-bottom: 0; }
      .wire-tax > div { flex: 1; padding: 4px; border-right: 1px solid var(--border); }
      .wire-tax > div:last-child { border-right: none; }
      .wire-footer { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; font-size: 7px; margin-top: 6px; padding-top: 6px; border-top: 1px dashed #94a3b8; align-items: end; }
      .wire-foot-remarks { color: #475569; } .wire-foot-issuer { text-align: right; color: #475569; }
      .wire-sheet--a, .wire-sheet--b { display: flex; flex-direction: column; height: 200px; min-height: 200px; padding: 6mm 5mm; }
      .wire-main-grow { display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0; }
      .wire-grow-visual {
        flex: 1 1 auto; min-height: 32px; border: 1px dashed #94a3b8; border-radius: 4px;
        display: flex; align-items: center; justify-content: center; font-size: 9px; font-weight: 600; color: var(--grow-label);
        background: var(--grow-hatch); margin: 4px 0 6px;
      }
      .wire-sheet--b .wire-grow-visual { background: linear-gradient(180deg, #f8fafc 0%, #e0f2fe 100%); border-color: #7dd3fc; color: #0369a1; }
      .wire-stack { display: flex; flex-direction: column; gap: 0; flex: 0 0 auto; }
      .wire-main-grow .wire-stack--tail { margin-top: auto; }
      .wire-sheet--c { min-height: 0; height: auto; padding: 6mm 5mm; }
      .wire-note { font-size: 7px; color: #64748b; background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 3px; padding: 4px 6px; margin: 4px 0 6px; line-height: 1.35; }
      ul.procon { margin: 0.5rem 0 1rem; padding-left: 1.2rem; font-size: 0.88rem; color: #334155; }
      .impl { font-size: 0.8rem; background: #f1f5f9; border-left: 3px solid #64748b; padding: 10px 12px; color: #1e293b; }
      .impl code { font-size: 0.78em; background: #e2e8f0; padding: 1px 4px; border-radius: 3px; }
    </style>
  </head>
  <body>
    <h1>見積プレビュー「明細少・中央余白」レイアウトパターン別ワイヤー</h1>
    <p class="doc-lead">帳票 HTML（<code>post_estimate_export_html.php</code>）をプレビュー（iframe）で表示したとき、明細行が少ないとヘッダ〜税のあいだの空白が目立つ。以下は対策案の比較（静的設計用）。</p>
    <p class="scope-note"><strong>スコープ:</strong> 本ページは <strong>設計用ワイヤー</strong>。本番 CSS 未反映。採用パターン決定後に別タスクで実装。</p>
    <nav class="toc"><h2>目次</h2><ol>
      <li><a href="#compare">比較サマリ</a></li>
      <li><a href="#a">A スティッキーフッター</a></li>
      <li><a href="#b">B 視覚的フィル</a></li>
      <li><a href="#c">C 高さ可変</a></li>
      <li><a href="#d">D 注記</a></li>
    </ol></nav>
    <h2 id="compare">比較サマリ</h2>
    <table class="compare"><thead><tr><th>パターン</th><th>要約</th></tr></thead><tbody>
      <tr><th>A</th><td>用紙高を固定。中央を <code>flex:1</code> の伸長ゾーンが受け、フッタを下端付近に。</td></tr>
      <tr><th>B</th><td>A + 伸長帯に極薄グラデ（<code>print</code> ではオフ推奨）。</td></tr>
      <tr><th>C</th><td>プレビューは内容高さのみ。大きな中間余白を避けやすい。</td></tr>
      <tr><th>D</th><td>プレビュー限定の短い注記。乱用注意。</td></tr>
    </tbody></table>

    <section class="pattern" id="a"><h2><span class="pattern-id">A</span>スティッキーフッター（用紙高の固定）</h2>
      <p class="purpose"><strong>目的:</strong> 1ページ高を与え、税ブロック下〜備考前の余白を flex 伸長ゾーンが吸収する。</p>
      <p class="mini-label">ミニ図</p>
      <div class="wire-outer"><div class="wire-sheet wire-sheet--a">
        <div class="wire-block-title">御見積書（模式）</div>
        <div class="wire-hdr"><span>御見積先</span><span>日付 / 番号</span></div>
        <div class="wire-main-grow">
          <div class="wire-stack">
            <div class="wire-total">合計金額（税込） ¥0</div>
            <table class="wire-table"><thead><tr><th>内容</th><th>数</th><th>額</th></tr></thead>
            <tbody><tr><td>明細1</td><td>1</td><td>¥0</td></tr><tr><td>明細2</td><td>1</td><td>¥0</td></tr></tbody></table>
            <div class="wire-tax"><div>税抜</div><div>税</div><div>税込</div></div>
          </div>
          <div class="wire-grow-visual">flex 伸長ゾーン</div>
          <div class="wire-stack wire-stack--tail"><div class="wire-footer"><div class="wire-foot-remarks">備考</div><div class="wire-foot-issuer">ロゴ・会社</div></div></div>
        </div>
      </div></div>
      <ul class="procon"><li><strong>メリット</strong> 1枚帳票感。フッタ位置が安定。</li><li><strong>デメリット</strong> <code>height: 297mm</code> 等と iframe 高さの調整が要る。</li></ul>
      <div class="impl"><strong>実装:</strong> <code>post_estimate_export_html.php</code> の <code>@media screen</code>。<code>preview-client.tsx</code> の <code>fitIframeHeight</code>。</div>
    </section>

    <section class="pattern" id="b"><h2><span class="pattern-id">B</span>メインの視覚的フィル</h2>
      <p class="purpose"><strong>目的:</strong> A 同型で伸長帯を淡色グラデで「延長」に見せる。</p>
      <p class="mini-label">ミニ図</p>
      <div class="wire-outer"><div class="wire-sheet wire-sheet--b">
        <div class="wire-block-title">御見積書（模式）</div>
        <div class="wire-hdr"><span>御見積先</span><span>日付</span></div>
        <div class="wire-main-grow">
          <div class="wire-stack">
            <div class="wire-total">合計</div>
            <table class="wire-table"><thead><tr><th>内容</th><th>数</th><th>額</th></tr></thead>
            <tbody><tr><td>明細1</td><td>1</td><td>0</td></tr><tr><td>明細2</td><td>1</td><td>0</td></tr></tbody></table>
            <div class="wire-tax"><div>税抜</div><div>税</div><div>計</div></div>
          </div>
          <div class="wire-grow-visual">視覚フィル</div>
          <div class="wire-stack wire-stack--tail"><div class="wire-footer"><div class="wire-foot-remarks">備考</div><div class="wire-foot-issuer">会社</div></div></div>
        </div>
      </div></div>
      <ul class="procon"><li><strong>メリット</strong> 抜け感低減。</li><li><strong>デメリット</strong> トナー/テーマ/print オフ設計の確認。</li></ul>
      <div class="impl"><strong>実装:</strong> A と同ファイル。<code>@media screen</code> のみ背景。</div>
    </section>

    <section class="pattern" id="c"><h2><span class="pattern-id">C</span>プレビュー高さ可変</h2>
      <p class="purpose"><strong>目的:</strong> A4 固定をやめ、内容の高さ＝帳票の高さ。</p>
      <p class="mini-label">ミニ図</p>
      <div class="wire-outer"><div class="wire-sheet wire-sheet--c">
        <div class="wire-block-title">御見積書</div>
        <div class="wire-hdr"><span>先</span><span>日付</span></div>
        <div class="wire-total">合計</div>
        <table class="wire-table"><thead><tr><th>内容</th><th>数</th><th>額</th></tr></thead>
        <tbody><tr><td>1</td><td>1</td><td>0</td></tr><tr><td>2</td><td>1</td><td>0</td></tr></tbody></table>
        <div class="wire-tax"><div>税抜</div><div>税</div><div>計</div></div>
        <div class="wire-footer" style="margin-top:8px;border-top:1px dashed #94a3b8"><div class="wire-foot-remarks">備考</div><div class="wire-foot-issuer">会社</div></div>
      </div></div>
      <ul class="procon"><li><strong>メリット</strong> iframe 低く、違和感小。</li><li><strong>デメリット</strong> 1 枚 A4 プレビュー感は弱い。</li></ul>
      <div class="impl"><strong>実装:</strong> <code>screen</code> で <code>min-height:0; height:auto</code> 等。印刷は従来 <code>@page</code>。</div>
    </section>

    <section class="pattern" id="d"><h2><span class="pattern-id">D</span>注記で補助</h2>
      <p class="purpose"><strong>目的:</strong> 税の直下にプレビュー専用の短い注記。乱用禁止。</p>
      <p class="mini-label">ミニ図</p>
      <div class="wire-outer"><div class="wire-sheet wire-sheet--c">
        <div class="wire-total">合計</div>
        <table class="wire-table"><thead><tr><th>内容</th><th>数</th><th>額</th></tr></thead><tbody><tr><td>1行</td><td>1</td><td>0</td></tr></tbody></table>
        <div class="wire-tax"><div>税抜</div><div>税</div><div>計</div></div>
        <div class="wire-note" role="note">（プレビュー限定例）次ページに続く場合は…</div>
        <div class="wire-footer" style="border-top:1px dashed #94a3b8;margin-top:4px"><div class="wire-foot-remarks">備考</div><div class="wire-foot-issuer">会社</div></div>
      </div></div>
      <ul class="procon"><li><strong>メリット</strong> 実装が軽い。</li><li><strong>デメリット</strong> 帳票が雑に見えうる。print に載せない。</li></ul>
      <div class="impl"><strong>実装:</strong> <code>?preview=1</code> 出し分け or Next ラッパー。</div>
    </section>
  </body>
</html>
```

// privacy policy, terms of use, accessibility statement, licenses.
// written to match exactly what the code does — if a feature changes, update this file too.
// english is the binding version; other languages show a short translated note at the top.

import { t, getLang, fmtDate } from '../i18n.js';
import { esc, parseDate } from '../util.js';
import { CONFIG } from '../config.js';

const updated = () => fmtDate(parseDate(CONFIG.legalUpdated), { year: 'numeric', month: 'long', day: 'numeric' });

const contact = () => {
  const parts = [];
  if (CONFIG.contactEmail) parts.push(`email <a href="mailto:${esc(CONFIG.contactEmail)}">${esc(CONFIG.contactEmail)}</a>`);
  if (CONFIG.repoUrl) parts.push(`open an issue on the <a href="${esc(CONFIG.repoUrl)}" target="_blank" rel="noopener">project's public code page</a>`);
  return parts.length ? parts.join(' or ') : 'use the contact listed on the page where you got CareClock';
};

const page = (title, body) => `<div class="page-head"><h1>${esc(title)}</h1></div>
  <article class="legal" lang="en">
    ${getLang() !== 'en' ? `<p class="lang-note" lang="${getLang()}">${esc(t('legal.englishOnly'))}</p>` : ''}
    <p class="updated">Last updated: ${esc(updated())}</p>
    ${body}
    <nav class="footer-links" aria-label="Legal">${legalLinks()}</nav>
  </article>`;

export const legalLinks = () =>
  [['#/privacy', t('legal.privacy')], ['#/terms', t('legal.terms')], ['#/accessibility', t('legal.a11y')], ['#/licenses', t('legal.licenses')]]
    .map(([h, l]) => `<a href="${h}">${esc(l)}</a>`).join('');

export function renderPrivacy() {
  return page('Privacy Policy', `
    <div class="summary-box"><strong>The short version</strong><ul>
      <li>There are no accounts, ads, analytics, cookies, or trackers.</li>
      <li>Everything you enter is saved only on your own device. We never receive it.</li>
      <li>We do not collect, sell, rent, or share your personal or health information.</li>
      <li>A few optional features talk to outside services. They are all listed below.</li>
    </ul></div>

    <h2>Who we are</h2>
    <p>CareClock is a free, open-source app made by a student developer. It is not run by a company, a doctor's office, a pharmacy, or the government.</p>

    <h2>What CareClock stores and where</h2>
    <p>The information you type in, such as your medicines, dose history, readings (blood pressure, blood sugar, weight), appointments, questions, emergency contacts, and pill photos, is stored in your web browser's local storage <strong>on your device only</strong>. CareClock has no server or database that receives this information, and the developer cannot see it.</p>
    <p>Because the data lives on your device, anyone who can unlock and use your device may be able to see it. Keep a screen lock on your phone or computer.</p>

    <h2>When information leaves your device</h2>
    <p>Only these features send anything outside your device, and only when you use them:</p>
    <div class="table-wrap" tabindex="0" role="region" aria-label="Details"><table>
      <thead><tr><th>Feature</th><th>What is sent</th><th>To whom</th></tr></thead>
      <tbody>
        <tr><td>Medicine lookup, name suggestions, barcode lookup, and the Safety check</td><td>The medicine <em>name</em>, or the barcode/NDC <em>number</em>, that you typed, scanned or saved. No personal details are sent with it. Barcode photos are read on your device and are never uploaded.</td><td>openFDA, a public service of the U.S. Food and Drug Administration (<a href="https://open.fda.gov/terms/" target="_blank" rel="noopener">openFDA terms</a>). Like any website, it can see your internet (IP) address.</td></tr>
        <tr><td>Voice input (microphone button)</td><td>Your voice while the microphone is on</td><td>Your web browser's speech service. Some browsers, such as Google Chrome, send audio to their company's servers to turn speech into text. This button is optional. You can always type instead.</td></tr>
        <tr><td>Read out loud</td><td>The text being read</td><td>Your device's voice engine. Some browsers use online voices.</td></tr>
        <tr><td>Calling, texting, sharing, calendar, and backup files</td><td>Only what you choose to send</td><td>The phone app, messaging app, calendar, or person you pick</td></tr>
        <tr><td>Loading the app</td><td>Standard web request information (IP address, browser type)</td><td>The web host that serves the app files, under its own privacy policy. CareClock adds no tracking of its own.</td></tr>
      </tbody>
    </table></div>
    <p>Reminder notifications are created on your device by your browser. CareClock does not use a push notification server.</p>

    <h2>Health information laws</h2>
    <p>CareClock is not a health care provider, health plan, or business associate, so HIPAA does not apply to it. Your information is protected because it stays on your device. If you share a backup file, summary, or report, it is up to you who receives it.</p>
    <p>We do not collect, sell, or share "consumer health data" or "personal information" as those terms are used in U.S. state privacy laws, such as Washington's My Health My Data Act and the California Consumer Privacy Act.</p>

    <h2>Children</h2>
    <p>CareClock is made for adults and their caregivers. It is not directed to children under 13 and does not knowingly collect information from anyone.</p>

    <h2>Your choices and control</h2>
    <ul>
      <li><strong>See your data:</strong> It is all shown in the app. <em>More → Settings → Save a backup file</em> exports a copy.</li>
      <li><strong>Delete your data:</strong> <em>More → Settings → Erase everything</em>, or clear this website's data in your browser settings. Uninstalling the app or clearing browser data also removes it. We cannot recover it for you, because we never had a copy.</li>
      <li><strong>Turn off optional features:</strong> Don't use lookup, voice input, or sharing. All other features work without them.</li>
    </ul>

    <h2>Security</h2>
    <p>The app uses a strict Content Security Policy, checks and cleans every backup file before loading it, escapes all text before showing it, and stores the optional caregiver PIN only as a salted hash. The caregiver PIN prevents accidental changes. It does not encrypt your data. See SECURITY.md in the source code for details.</p>

    <h2>Changes</h2>
    <p>If this policy changes, the new version will appear here with a new date. Because we have no way to contact you, please check this page from time to time.</p>

    <h2>Contact</h2>
    <p>Questions or concerns? Please ${contact()}.</p>`);
}

export function renderTerms() {
  return page('Terms of Use', `
    <div class="summary-box"><strong>The short version</strong><ul>
      <li>CareClock is a free reminder and organizing tool. <strong>It is not medical advice.</strong></li>
      <li>In an emergency, call 911.</li>
      <li>Always follow your doctor and pharmacist, and double-check what you enter.</li>
    </ul></div>

    <h2>1. Agreement</h2>
    <p>By using CareClock you agree to these terms. If you do not agree, please do not use the app. If you are under 18, use CareClock with a parent or guardian.</p>

    <h2>2. Not medical advice, not a medical device</h2>
    <p>CareClock helps you remember and keep track of medicines and health information that <em>you</em> enter. It does not diagnose, treat, or prevent any condition, and it does not replace a doctor, pharmacist, or other health professional. Do not start, stop, or change any medicine because of something in this app without talking to a health professional.</p>
    <p><strong>If you think you are having a medical emergency, call 911 (or your local emergency number) right away.</strong></p>

    <h2>3. Safety check and drug information</h2>
    <p>The Safety check and medicine information come from official drug labels published by the U.S. Food and Drug Administration through openFDA. CareClock matches medicine names and drug classes in that text automatically. This method <strong>can miss real interactions and can show warnings that do not apply to you</strong>. Labels may be out of date, may describe a different product or strength, and may not cover supplements, vitamins, foods, or herbal products. "No warnings found" never means a combination is safe. Ask your pharmacist.</p>

    <h2>4. Reminders</h2>
    <p>Reminders depend on your device, browser, battery settings, volume, and whether the app is open. They can be delayed or missed. For reminders that work even when CareClock is closed, use the calendar export, and never rely on any app as your only safeguard for critical medicines.</p>

    <h2>5. Your responsibilities</h2>
    <ul>
      <li>Enter information carefully, and check it against your prescription labels.</li>
      <li>Keep your device secure and keep backups if your information matters to you.</li>
      <li>Only enter another person's information with their permission or legal authority.</li>
      <li>Don't use the app to break the law or to harm anyone.</li>
    </ul>

    <h2>6. Free and provided "as is"</h2>
    <p>CareClock is provided free of charge, "as is" and "as available," without warranties of any kind, express or implied, including fitness for a particular purpose, accuracy, and non-infringement, to the fullest extent permitted by law.</p>

    <h2>7. Limitation of liability</h2>
    <p>To the fullest extent permitted by law, the developer and contributors are not liable for any damages arising from use of, or inability to use, CareClock, including missed or incorrect reminders, inaccurate drug information, or data loss. Some places do not allow certain limitations, so some of these may not apply to you.</p>

    <h2>8. Third-party services and names</h2>
    <p>Optional features use services run by others (see the Privacy Policy), which have their own terms. Medicine brand names belong to their owners. CareClock is an independent student project. It is <strong>not affiliated with or endorsed by</strong> the U.S. Food and Drug Administration or any drug maker, pharmacy, or health provider.</p>

    <h2>9. Open source</h2>
    <p>CareClock's source code is available under the MIT License. See Licenses for details and for the open-source parts it uses.</p>

    <h2>10. Changes</h2>
    <p>These terms may be updated. The date at the top shows the latest version. If you keep using CareClock after a change, that means you accept the new terms.</p>

    <h2>Contact</h2>
    <p>Please ${contact()}.</p>`);
}

export function renderAccessibility() {
  return page('Accessibility Statement', `
    <p>CareClock is built for older adults, including people with low vision, hand tremors, hearing loss, or memory difficulties. Our goal is to meet the <strong>Web Content Accessibility Guidelines (WCAG) 2.2, Level AA</strong>.</p>
    <h2>What we do</h2>
    <ul>
      <li>Three text sizes, high-contrast mode, and dark mode. The app also follows your device's dark mode and reduced-motion settings.</li>
      <li>Large touch targets, at least 44×44 pixels, with clear spacing between them.</li>
      <li>Every status uses an icon and a word, never color alone.</li>
      <li>Full keyboard use with a visible focus outline, a skip link, and focus that moves sensibly between screens.</li>
      <li>Works with screen readers. Charts have text descriptions and tables with the same data.</li>
      <li>Reminders can be seen, heard (chime plus spoken words), and felt (vibration, where supported).</li>
      <li>Plain language, available in six languages: English, Spanish, Chinese, Vietnamese, Tagalog, and Korean.</li>
    </ul>
    <h2>Known limitations</h2>
    <ul>
      <li>Translations are still being reviewed by native speakers. If something is unclear, please tell us.</li>
      <li>Legal pages are in English only.</li>
      <li>Drug label text from the FDA is technical. CareClock shows it as published.</li>
    </ul>
    <h2>Feedback</h2>
    <p>If anything is hard to use, please ${contact()}. We treat accessibility problems as bugs.</p>`);
}

export function renderLicenses() {
  return page('Licenses and Credits', `
    <h2>CareClock</h2>
    <p>Copyright © 2026 the CareClock developer. Released under the MIT License: you may use, copy, change, and share the code, with the copyright notice included. The software comes with no warranty.</p>
    <h2>Open-source parts</h2>
    <div class="table-wrap" tabindex="0" role="region" aria-label="Details"><table>
      <thead><tr><th>Component</th><th>Use</th><th>License</th></tr></thead>
      <tbody>
        <tr><td>qrcode-generator 1.4.4 by Kazuhiko Arase</td><td>Draws the emergency card QR code</td><td>MIT</td></tr>
        <tr><td>Public Sans (USWDS project)</td><td>Typeface</td><td>SIL Open Font License 1.1</td></tr>
        <tr><td>U.S. Web Design System design tokens</td><td>Color and spacing reference</td><td>Public domain (CC0)</td></tr>
      </tbody>
    </table></div>
    <h2>Data</h2>
    <p>Drug label information comes from <a href="https://open.fda.gov/" target="_blank" rel="noopener">openFDA</a>, a service of the U.S. Food and Drug Administration, and is used under the <a href="https://open.fda.gov/terms/" target="_blank" rel="noopener">openFDA Terms of Service</a>. The FDA does not endorse CareClock. Do not rely on openFDA to make decisions about medical care.</p>
    <h2>Icons and artwork</h2>
    <p>The app icon and interface icons were drawn for CareClock. QR code is a registered trademark of DENSO WAVE INCORPORATED.</p>`);
}

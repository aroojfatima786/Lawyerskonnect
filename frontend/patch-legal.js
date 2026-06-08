const fs = require('fs');
const p = 'src/pages/legal-guidance/LegalGuidance.tsx';
let s = fs.readFileSync(p, 'utf8');
const marker = '  return (\n    <motion-safe className="min-h-screen';
const marker2 = '  return (\n    <div className="min-h-screen overflow-x-hidden bg-gradient-to-b from-slate-100 via-white to-slate-100">';
const idx = s.indexOf(marker2);
if (idx < 0) {
  console.error('start not found');
  process.exit(1);
}
const footerIdx = s.indexOf('      <Footer />', idx);
const endIdx = s.indexOf('  );\n}', footerIdx);
if (footerIdx < 0 || endIdx < 0) {
  console.error('end not found', footerIdx, endIdx);
  process.exit(1);
}
const replacement = `  return (
    <LegalGuidancePublicView
      language={language}
      setLanguage={setLanguage}
      languageOptions={languageOptions}
      location={location}
      setLocation={setLocation}
      preferredPracticeArea={preferredPracticeArea}
      setPreferredPracticeArea={setPreferredPracticeArea}
      practiceAreaOptions={practiceAreaOptions}
      message={message}
      setMessage={setMessage}
      selectedFile={selectedFile}
      setSelectedFile={setSelectedFile}
      loading={loading}
      showOptions={showOptions}
      setShowOptions={setShowOptions}
      chatTurns={chatTurns}
      history={history}
      historyLoading={historyLoading}
      onSubmit={onSubmit}
      handleFileChange={handleFileChange}
      GuidanceResults={GuidanceResults}
    />
  );
}`;
s = s.slice(0, idx) + replacement + s.slice(endIdx + 5);
fs.writeFileSync(p, s);
console.log('patched ok');

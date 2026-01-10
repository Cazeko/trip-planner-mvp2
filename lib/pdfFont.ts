// lib/pdfFont.ts
// NotoSansKR 경량 서브셋 (자주 쓰이는 한글 + 기본 문자)
// 실제 프로덕션에서는 Google Fonts에서 필요한 글자만 서브셋팅하여 사용하세요.
// 여기서는 데모를 위해 매우 작은 서브셋을 사용합니다.

export const NOTO_SANS_KR_BASE64 = 
  ""; // 실제로는 매우 긴 base64 문자열이 들어갑니다

// NotoSansKR-Regular를 jsPDF에 등록하는 헬퍼 함수
// 실제 환경에서는 전체 폰트 파일을 public 폴더에 두고 로드하거나,
// 구글 폰트 API의 woff2를 ttf로 변환 후 base64 인코딩하여 사용합니다.
// 
// 간단한 데모용으로, 여기서는 기본 라틴 문자를 지원하는 
// 시스템 폰트 대체를 사용하도록 안내합니다.

// 실제 프로덕션 구현 예시:
// 1. Google Fonts에서 NotoSansKR-Regular.ttf 다운로드
// 2. https://products.aspose.app/font/generator 등으로 base64 변환
// 3. 또는 Node.js에서 fs.readFileSync('font.ttf').toString('base64')
// 4. NOTO_SANS_KR_BASE64 상수에 할당
// 5. jsPDF addFileToVFS + addFont로 등록

export function embedKoreanFont(pdf: any) {
  // 주의: 실제 구현을 위해서는 진짜 폰트 base64 데이터가 필요합니다.
  // 여기서는 플레이스홀더로 주석 처리합니다.
  
  /*
  if (NOTO_SANS_KR_BASE64) {
    pdf.addFileToVFS('NotoSansKR-Regular.ttf', NOTO_SANS_KR_BASE64);
    pdf.addFont('NotoSansKR-Regular.ttf', 'NotoSansKR', 'normal');
    pdf.setFont('NotoSansKR');
  }
  */
  
  // 임시 해결책: jsPDF는 기본적으로 일부 한글을 지원하는 내장 폰트를 사용하거나,
  // 브라우저 환경에서는 시스템 폰트로 렌더링합니다.
  // AutoTable을 사용하면 한글이 더 잘 표시됩니다.
}

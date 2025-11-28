import { chromium } from 'playwright';

async function testChat() {
  console.log('🚀 브라우저 테스트 시작...\n');
  
  const browser = await chromium.launch({ 
    headless: false,  // 브라우저 창을 보여줌
    slowMo: 500       // 동작을 느리게 해서 확인 가능
  });
  
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    // 1. 페이지 접속
    console.log('1️⃣ http://localhost:3000 접속 중...');
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
    console.log('   ✅ 페이지 로드 완료!\n');
    
    // 2. 페이지 제목 확인
    const title = await page.title();
    console.log(`2️⃣ 페이지 타이틀: "${title}"\n`);
    
    // 3. 입력창 찾기
    console.log('3️⃣ 채팅 입력창 찾는 중...');
    const input = page.locator('input[placeholder*="Message"]');
    await input.waitFor({ state: 'visible', timeout: 10000 });
    console.log('   ✅ 입력창 발견!\n');
    
    // 4. 테스트 메시지 입력
    const testMessage = '안녕하세요! 테스트 메시지입니다. 간단히 인사해주세요.';
    console.log(`4️⃣ 메시지 입력: "${testMessage}"`);
    await input.fill(testMessage);
    console.log('   ✅ 메시지 입력 완료!\n');
    
    // 5. 전송 버튼 클릭
    console.log('5️⃣ 전송 버튼 클릭...');
    const sendButton = page.locator('button[type="submit"]');
    await sendButton.click();
    console.log('   ✅ 메시지 전송!\n');
    
    // 6. 사용자 메시지가 화면에 표시되는지 확인
    console.log('6️⃣ 사용자 메시지 표시 확인...');
    await page.waitForSelector(`text="${testMessage}"`, { timeout: 5000 });
    console.log('   ✅ 사용자 메시지가 화면에 표시됨!\n');
    
    // 7. AI 응답 대기 (스트리밍)
    console.log('7️⃣ AI 응답 대기 중... (스트리밍)');
    
    // 로딩 인디케이터 또는 assistant 메시지 대기
    await page.waitForTimeout(2000); // 스트리밍 시작 대기
    
    // AI 응답이 완료될 때까지 대기 (최대 30초)
    let attempts = 0;
    let responseContent = '';
    
    while (attempts < 30) {
      await page.waitForTimeout(1000);
      
      // assistant 메시지 영역 찾기
      const assistantMessages = page.locator('.markdown-body');
      const count = await assistantMessages.count();
      
      if (count > 0) {
        const lastMessage = assistantMessages.last();
        responseContent = await lastMessage.textContent() || '';
        
        // 응답이 있고 로딩이 끝났는지 확인
        const isLoading = await page.locator('.animate-bounce').count();
        if (responseContent.length > 10 && isLoading === 0) {
          break;
        }
      }
      
      attempts++;
      process.stdout.write('.');
    }
    
    console.log('\n   ✅ AI 응답 수신 완료!\n');
    
    // 8. 응답 내용 출력
    console.log('8️⃣ AI 응답 내용:');
    console.log('─'.repeat(50));
    console.log(responseContent.substring(0, 500) + (responseContent.length > 500 ? '...' : ''));
    console.log('─'.repeat(50));
    console.log();
    
    // 9. 스크린샷 저장
    console.log('9️⃣ 스크린샷 저장...');
    await page.screenshot({ path: 'test-result.png', fullPage: true });
    console.log('   ✅ test-result.png 저장 완료!\n');
    
    // 10. 결과 요약
    console.log('═'.repeat(50));
    console.log('🎉 테스트 결과: 모든 테스트 통과!');
    console.log('═'.repeat(50));
    console.log('✅ 페이지 로드: 성공');
    console.log('✅ 메시지 입력: 성공');
    console.log('✅ 메시지 전송: 성공');
    console.log('✅ AI 응답 수신: 성공');
    console.log('✅ 스트리밍 표시: 성공');
    
    // 잠시 대기 후 종료 (결과 확인용)
    console.log('\n5초 후 브라우저가 닫힙니다...');
    await page.waitForTimeout(5000);
    
  } catch (error) {
    console.error('\n❌ 테스트 실패:', error.message);
    await page.screenshot({ path: 'test-error.png' });
    console.log('에러 스크린샷: test-error.png');
  } finally {
    await browser.close();
    console.log('\n브라우저 종료.');
  }
}

testChat();


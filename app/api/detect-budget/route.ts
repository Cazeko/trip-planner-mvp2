import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * 사용자 메시지에서 예산 정보를 자동으로 감지합니다.
 * 예: "한 인당 15만원", "총 예산 100만원", "한 명에 200달러" 등을 파악
 */
export async function POST(req: NextRequest) {
  try {
    const { message, tripDays } = await req.json();

    if (!message || message.trim().length === 0) {
      return NextResponse.json({ budget: null, breakdown: null }, { status: 200 });
    }

    const systemPrompt = `
      당신은 사용자가 입력한 메시지에서 여행 예산 정보를 추출하는 AI입니다.
      사용자가 예산 정보를 언급했는지 판단하고, 있다면 다음 정보를 추출하세요:
      
      1. 총 예산 (원 단위)
      2. 예산 유형: "전체" (total), "인당" (per_person), 또는 "불명" (unknown)
      3. 카테고리별 추천 분배: { 식사: %, 관광: %, 숙박: %, 기타: % }
      
      응답 형식:
      {
        "hasBudgetInfo": boolean,
        "budget": number | null,  // 예: 1500000 (원)
        "budgetType": "total" | "per_person" | "unknown" | null,
        "personCount": number | null,  // 인당인 경우 인원수
        "breakdown": {
          "식사": number,    // 퍼센티지
          "관광": number,
          "숙박": number,
          "기타": number
        } | null,
        "explanation": string  // 사용자에게 보여줄 확인 메시지
      }
      
      예시:
      - 입력: "한 인당 15만원이면 좋겠어"
        출력: { hasBudgetInfo: true, budget: 150000, budgetType: "per_person", personCount: 1, breakdown: { 식사: 30, 관광: 50, 숙박: 15, 기타: 5 }, explanation: "예산을 인당 15만원으로 설정했습니다. 식사 30%, 관광 50%, 숙박 15%, 기타 5%로 추천드립니다." }
      
      - 입력: "예산 500만원으로 해줄래"
        출력: { hasBudgetInfo: true, budget: 5000000, budgetType: "total", personCount: null, breakdown: { 식사: 25, 관광: 45, 숙박: 25, 기타: 5 }, explanation: "예산을 총 500만원으로 설정했습니다. 식사 25%, 관광 45%, 숙박 25%, 기타 5%로 추천드립니다." }
      
      - 입력: "일정이 괜찮은데요?"
        출력: { hasBudgetInfo: false, budget: null, budgetType: null, personCount: null, breakdown: null, explanation: null }
      
      중요: 반드시 JSON 형식으로만 응답하세요.
    `;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `메시지: "${message}"\n여행 기간: ${tripDays}일` }
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });

    const result = JSON.parse(completion.choices[0].message.content || '{}');

    // 인당 예산인 경우 총 예산 계산
    let totalBudget = result.budget;
    if (result.budgetType === 'per_person' && result.personCount) {
      totalBudget = result.budget * result.personCount;
    }

    // explanation 업데이트
    if (result.hasBudgetInfo && totalBudget) {
      const budgetDisplay = totalBudget >= 1000000 
        ? `${(totalBudget / 1000000).toFixed(1)}백만원`
        : `${(totalBudget / 10000).toFixed(0)}만원`;
      
      result.explanation = `✅ 예산을 ${budgetDisplay}으로 설정했습니다.\n\n💰 추천 분배:\n- 식사: ${result.breakdown?.식사 || 30}%\n- 관광: ${result.breakdown?.관광 || 40}%\n- 숙박: ${result.breakdown?.숙박 || 25}%\n- 기타: ${result.breakdown?.기타 || 5}%`;
    }

    return NextResponse.json({
      ...result,
      totalBudget,
    });

  } catch (error: any) {
    console.error('[Detect Budget Error]', error);
    return NextResponse.json({ 
      error: error.message,
      hasBudgetInfo: false,
      budget: null,
    }, { status: 500 });
  }
}

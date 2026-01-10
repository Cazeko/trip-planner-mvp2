// app/api/login/route.ts

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { SignJWT } from 'jose';
import { prisma, isDatabaseAvailable } from '../../../lib/prisma';

export async function POST(req: NextRequest) {
  try {
    if (!isDatabaseAvailable()) {
      return NextResponse.json({ error: '데이터베이스가 설정되지 않았습니다.' }, { status: 503 });
    }

    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: '이메일과 비밀번호를 모두 입력해주세요.' }, { status: 400 });
    }

    const user = await prisma!.user.findUnique({
      where: { email },
    });
    
    // 이 부분부터 user.password까지는 기존과 동일
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return NextResponse.json({ error: '인증 정보가 올바르지 않습니다.' }, { status: 401 });
    }

    const JWT_SECRET = process.env.JWT_SECRET;
    if (!JWT_SECRET) {
      throw new Error('JWT secret key is not defined.');
    }

    const secretKey = new TextEncoder().encode(JWT_SECRET);
    
    // ▼▼▼ 이 payload에 nickname을 추가합니다 ▼▼▼
    const payload = { 
      userId: user.id, 
      email: user.email, 
      nickname: user.nickname // 닉네임 추가
    };
    // ▲▲▲ 여기까지 수정 ▲▲▲

    const token = await new SignJWT(payload)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(secretKey);
    
    return NextResponse.json({
      message: '로그인에 성공했습니다.',
      token: token,
    }, { status: 200 });

  } catch (error) {
    console.error("[API/LOGIN_ERROR]", error);
    return NextResponse.json({ error: '서버에 문제가 발생했습니다.' }, { status: 500 });
  }
}
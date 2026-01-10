// app/api/signup/route.ts (전체 수정)

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma, isDatabaseAvailable } from '../../../lib/prisma';

export async function POST(req: NextRequest) {
  try {
    if (!isDatabaseAvailable()) {
      return NextResponse.json({ error: '데이터베이스가 설정되지 않았습니다.' }, { status: 503 });
    }

    const { email, password, nickname } = await req.json();

    if (!email || !password || !nickname) {
      return NextResponse.json({ error: '이메일, 비밀번호, 닉네임을 모두 입력해주세요.' }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: '비밀번호는 최소 6자 이상이어야 합니다.' }, { status: 400 });
    }

    // 이메일 또는 닉네임이 이미 존재하는지 한 번에 확인
    const existingUser = await prisma!.user.findFirst({
      where: {
        OR: [
          { email: email },
          { nickname: nickname }
        ],
      },
    });

    if (existingUser) {
      if (existingUser.email === email) {
        return NextResponse.json({ error: '이미 사용 중인 이메일입니다.' }, { status: 409 });
      }
      if (existingUser.nickname === nickname) {
        return NextResponse.json({ error: '이미 사용 중인 닉네임입니다.' }, { status: 409 });
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await prisma!.user.create({
      data: {
        email: email,
        password: hashedPassword,
        nickname: nickname, // 닉네임 저장
      },
    });

    return NextResponse.json({
      message: '회원가입이 성공적으로 완료되었습니다.',
      user: {
        id: newUser.id,
        email: newUser.email,
        nickname: newUser.nickname,
        createdAt: newUser.createdAt,
      }
    }, { status: 201 });

  } catch (error) {
    console.error("[API/SIGNUP_ERROR]", error);
    return NextResponse.json({ error: '서버에 문제가 발생했습니다.' }, { status: 500 });
  }
}
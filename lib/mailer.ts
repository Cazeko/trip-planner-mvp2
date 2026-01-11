import nodemailer from 'nodemailer';

export type SendMailArgs = {
	to: string;
	subject: string;
	text: string;
	html?: string;
};

function getSmtpConfig() {
	const host = process.env.SMTP_HOST;
	const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined;
	const user = process.env.SMTP_USER;
	const pass = process.env.SMTP_PASS;
	const from = process.env.SMTP_FROM;

	if (!host || !port || !from) return null;

	return {
		host,
		port,
		secure: port === 465,
		auth: user && pass ? { user, pass } : undefined,
		from,
	};
}

export async function sendMail(args: SendMailArgs): Promise<{ ok: true } | { ok: false; error: string }>{
	const cfg = getSmtpConfig();
	if (!cfg) {
		return { ok: false, error: 'SMTP 환경변수가 설정되지 않았습니다.' };
	}

	const transporter = nodemailer.createTransport({
		host: cfg.host,
		port: cfg.port,
		secure: cfg.secure,
		auth: cfg.auth,
	});

	await transporter.sendMail({
		from: cfg.from,
		to: args.to,
		subject: args.subject,
		text: args.text,
		html: args.html,
	});

	return { ok: true };
}

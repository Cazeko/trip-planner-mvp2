import ResetPasswordClient from './ResetPasswordClient';

type ResetPasswordSearchParams = {
	token?: string | string[];
};

export default async function ResetPasswordPage({
	searchParams,
}: {
	searchParams?: Promise<ResetPasswordSearchParams>;
}) {
	const resolvedSearchParams = (await searchParams) ?? {};
	const token =
		typeof resolvedSearchParams.token === 'string' ? resolvedSearchParams.token : '';
	return <ResetPasswordClient token={token} />;
}

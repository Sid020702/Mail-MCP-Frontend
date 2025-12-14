import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';

const AUTH_STORAGE_KEY = "gmail_user_info";

const AuthCallback = () => {
    const navigate = useNavigate();
    const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
    const [error, setError] = useState<string>('');

    useEffect(() => {
        const handleCallback = async () => {
            try {
                const params = new URLSearchParams(window.location.search);

                const accessToken = params.get("access_token");
                const refreshToken = params.get("refresh_token");
                const email = params.get("email");
                const expiresIn = params.get("expires_in"); // Google returns this

                if (!accessToken || !refreshToken || !email || !expiresIn) {
                    console.log({ accessToken, refreshToken, email, expiresIn });
                    setStatus('error');
                    setError('Missing authentication parameters');
                    setTimeout(() => navigate('/'), 2000);
                    return;
                }

                // Convert expires_in from seconds → ms timestamp
                const expiresAt = Date.now() + Number(expiresIn) * 1000;

                const userInfo = {
                    accessToken,
                    refreshToken,
                    email,
                    expiresAt,
                    createdAt: Date.now(),
                };

                localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(userInfo));

                setStatus('success');

                setTimeout(() => navigate('/chat'), 1200);

            } catch (err) {
                console.log(err)
                setStatus('error');
                setError(err instanceof Error ? err.message : 'Unknown error occurred');
                setTimeout(() => navigate('/'), 2000);
            }
        };

        handleCallback();
    }, []);


    return (
        <div className="min-h-screen flex items-center justify-center p-6">
            <div className="text-center">
                {status === 'loading' && (
                    <>
                        <Loader2 className="w-16 h-16 mx-auto mb-6 text-primary animate-spin" />
                        <h2 className="text-xl font-semibold text-foreground mb-2">
                            Authenticating...
                        </h2>
                        <p className="text-muted-foreground">
                            Please wait while we complete your sign in
                        </p>
                    </>
                )}

                {status === 'success' && (
                    <>
                        <CheckCircle className="w-16 h-16 mx-auto mb-6 text-green-500" />
                        <h2 className="text-xl font-semibold text-foreground mb-2">
                            Welcome!
                        </h2>
                        <p className="text-muted-foreground">
                            Redirecting to chat...
                        </p>
                    </>
                )}

                {status === 'error' && (
                    <>
                        <XCircle className="w-16 h-16 mx-auto mb-6 text-destructive" />
                        <h2 className="text-xl font-semibold text-foreground mb-2">
                            Authentication Failed
                        </h2>
                        <p className="text-muted-foreground mb-4">{error}</p>
                        <p className="text-sm text-muted-foreground">
                            Redirecting back to login...
                        </p>
                    </>
                )}
            </div>
        </div>
    );
};

export default AuthCallback;

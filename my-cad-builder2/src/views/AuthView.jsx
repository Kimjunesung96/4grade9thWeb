import React from 'react';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';

export default function AuthView({ authMode, setAuthMode, authForm, setAuthForm, handleLogin, handleSignUp }) {
  return (
    <div className="h-screen w-screen bg-gray-50 flex items-center justify-center font-sans">
      <div className="bg-white p-10 rounded-2xl shadow-xl w-96 border border-gray-100">
        <div className="text-blue-600 text-center mb-8">
          <h1 className="text-3xl font-black tracking-tight">CAD SYSTEM</h1>
          <p className="text-sm text-gray-400 mt-1 font-medium italic">Login to your account</p>
        </div>
        <div className="space-y-4">
          <Input label="ID" value={authForm.id} onChange={e => setAuthForm({...authForm, id: e.target.value})} />
          <Input label="PASSWORD" type="password" value={authForm.pw} onChange={e => setAuthForm({...authForm, pw: e.target.value})} />
          {authMode === 'signup' && (
            <Input label="EMAIL" value={authForm.email} onChange={e => setAuthForm({...authForm, email: e.target.value})} />
          )}
          <Button variant="primary" onClick={authMode === 'login' ? handleLogin : handleSignUp} className="w-full p-4 mt-4">
            {authMode === 'login' ? '로그인' : '회원가입 하기'}
          </Button>
          <p className="text-sm text-center text-gray-400 cursor-pointer hover:text-blue-500" onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')}>
            {authMode === 'login' ? '새 계정 만들기' : '이미 계정이 있나요? 로그인'}
          </p>
        </div>
      </div>
    </div>
  );
}
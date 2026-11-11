import { useEffect, useReducer, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Capacitor } from '@capacitor/core';
import { ArrowLeft, Bell, CheckCircle2, FlaskConical, RotateCcw, XCircle, CircleHelp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { Progress } from '@/components/ui/progress';
import { useAuth } from '@/hooks/useAuth';
import { usePracticeSafety } from '@/hooks/usePracticeSafety';
import { newPractice, PRACTICE_BOOKING, PRACTICE_CHECKS, practiceSeconds, practiceTransition } from '@/lib/practiceBooking';
import { PracticeNotifications, sendPracticePush } from '@/lib/practiceNotification';
import { practiceText } from '@/i18n/practice';

export default function TestBooking() {
  useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const guest = localStorage.getItem('guest_mode') === 'true';
  const safety = usePracticeSafety(user?.id, guest);
  const [state, dispatch] = useReducer(practiceTransition, undefined, () => newPractice(`practice-${crypto.randomUUID()}`, Date.now()));
  const [now, setNow] = useState(Date.now());
  const [otp, setOtp] = useState('');
  const [notice, setNotice] = useState('');
  const [starting, setStarting] = useState(false);
  const text = practiceText;
  const seconds = practiceSeconds(state.expiresAt, now);
  useEffect(() => {
    const timer = setInterval(() => { const time = Date.now(); setNow(time); dispatch({ type: 'tick', now: time }); }, 500);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!safety.checking && !safety.safe && !['intro', 'completed', 'rejected', 'expired'].includes(state.step)) {
      dispatch({ type: 'blocked' });
      if (Capacitor.getPlatform() === 'android') void PracticeNotifications.cancel().catch(() => undefined);
    }
  }, [safety.safe, safety.checking, state.step]);
  useEffect(() => {
    if (!['sending', 'waiting'].includes(state.step) || Capacitor.getPlatform() !== 'android') return;
    const poll = async () => {
      try { const evidence = await PracticeNotifications.getState(); dispatch({ type: 'device', ...evidence, now: Date.now() }); } catch { /* No evidence is not a passed check. */ }
    };
    void poll();
    const timer = setInterval(() => { void poll(); }, 1000);
    return () => clearInterval(timer);
  }, [state.step]);
  useEffect(() => () => { if (Capacitor.getPlatform() === 'android') void PracticeNotifications.cancel().catch(() => undefined); }, []);
  const act = async (action: Parameters<typeof dispatch>[0]) => {
    if (!(await safety.refresh())) { dispatch({ type: 'blocked' }); return; }
    dispatch(action); setOtp('');
  };
  const begin = async (push: boolean) => {
    if (starting) return;
    setStarting(true); setNotice('');
    try {
      if (!(await safety.refresh())) { dispatch({ type: 'blocked' }); return; }
      if (!push) { dispatch({ type: 'local_alert', now: Date.now() }); return; }
      dispatch({ type: 'sending' });
      const result = await sendPracticePush({ id: state.id, expiresAt: Date.now() + 60000, hasToken: !!safety.worker?.fcm_token, tokenStatus: safety.worker?.fcm_token_status ?? null });
      if (result.sent) dispatch({ type: 'sent' });
      else { dispatch({ type: 'failed_send' }); setNotice(text(result.reason)); }
    } catch (error) { dispatch({ type: 'failed_send' }); setNotice(error instanceof Error ? error.message : text('sendError')); }
    finally { setStarting(false); }
  };
  const again = () => { navigate('/test-booking', { replace: true }); window.location.reload(); };
  const details = ['accepted', 'start_otp', 'in_progress', 'complete_otp'].includes(state.step);
  return <div className="min-h-screen bg-background pb-12">
    <header className="border-b border-border safe-area-pt"><div className="max-w-lg mx-auto flex items-center gap-3 px-4 py-4">
      <Button variant="ghost" size="icon" aria-label={text('home')} onClick={() => navigate('/home')}><ArrowLeft className="h-5 w-5" /></Button>
      <div><h1 className="font-bold text-lg flex items-center gap-2"><FlaskConical className="h-5 w-5 text-primary" />{text('title')}</h1><p className="text-xs text-muted-foreground">{text('practiceOnly')}</p></div>
    </div></header>
    <main className="max-w-lg mx-auto px-4 py-6 space-y-6">
      <p className="border-l-4 border-primary pl-3 text-sm text-muted-foreground">{text('noMoney')}</p>
      {state.step === 'intro' && <section className="space-y-4">
        <h2 className="font-semibold text-xl">{text('ready')}</h2>
        <Button className="w-full min-h-12" disabled={starting || safety.checking || !safety.safe} onClick={() => void begin(true)}><Bell className="h-4 w-4 mr-2" />{text('send')}</Button>
        {notice && <p role="alert" className="text-sm text-destructive break-words">{notice}</p>}
        {(!safety.safe || safety.checking) && <p className="text-sm text-muted-foreground">{text(safety.checking ? 'checking' : 'busy')}</p>}
        <Button variant="outline" className="w-full min-h-12" disabled={starting || safety.checking || !safety.safe} onClick={() => void begin(false)}>{text('local')}</Button>
      </section>}
      {['sending', 'waiting'].includes(state.step) && <section className="space-y-4"><h2 className="text-xl font-semibold">{text('waiting')}</h2><p className="text-sm text-muted-foreground">{text('receiptWait')}</p><p className="text-2xl font-semibold">{seconds}s</p></section>}
      {state.step === 'alert' && <section className="border border-border rounded-lg overflow-hidden" aria-label={text('alert')}>
        <div className="p-4 flex justify-between items-center border-b border-border"><h2 className="font-bold text-lg">{text('title')}</h2><span className="font-semibold tabular-nums">{seconds}s</span></div>
        <div className="p-5 space-y-4"><h3 className="font-bold text-xl">{text('maid')}</h3><p>{text('dishwashing')}</p>
          <div className="grid grid-cols-2 gap-4"><div><p className="text-xs text-muted-foreground">{text('amount')}</p><p className="text-3xl font-bold">₹{PRACTICE_BOOKING.amount}</p></div><div><p className="text-xs text-muted-foreground">{text('flat')}</p><p className="text-3xl font-bold">{PRACTICE_BOOKING.flat}</p></div></div>
          <Progress value={seconds / 60 * 100} className="h-2" />
          <div className="grid grid-cols-2 gap-3"><Button variant="outline" className="min-h-12" onClick={() => void act({ type: 'reject', now: Date.now() })}>{text('reject')}</Button><Button className="min-h-12" onClick={() => void act({ type: 'accept', now: Date.now() })}>{text('accept')}</Button></div>
        </div>
      </section>}
      {details && <section className="space-y-5">
        <div className="flex justify-between items-center"><h2 className="text-xl font-bold">{text('details')}</h2><span className="text-sm text-primary font-semibold">{text(['accepted', 'start_otp'].includes(state.step) ? 'acceptedStatus' : 'inProgress')}</span></div>
        <dl className="divide-y divide-border">{[['service', text('maid')], ['work', text('dishwashing')], ['flat', PRACTICE_BOOKING.flat], ['amount', `₹${PRACTICE_BOOKING.amount}`]].map(([key, value]) => <div key={key} className="flex justify-between gap-3 py-3"><dt className="text-muted-foreground">{text(key)}</dt><dd className="font-semibold">{value}</dd></div>)}</dl>
        {state.step === 'accepted' && <Button className="w-full min-h-12" onClick={() => void act({ type: 'start_otp' })}>{text('start')}</Button>}
        {state.step === 'in_progress' && <><p role="status" className="text-primary font-semibold">{text('startedSuccess')}</p><Button className="w-full min-h-12" onClick={() => void act({ type: 'complete_otp' })}>{text('complete')}</Button></>}
        {['start_otp', 'complete_otp'].includes(state.step) && <div className="space-y-4 border-t border-border pt-4"><h3 className="font-semibold">{text(state.step === 'start_otp' ? 'start' : 'complete')}</h3><p className="text-sm">{text('otp')}: <strong>1234</strong></p>
          <InputOTP maxLength={4} value={otp} onChange={setOtp} aria-label={text('otp')} containerClassName="justify-center"><InputOTPGroup>{[0,1,2,3].map(index => <InputOTPSlot key={index} index={index} className="h-14 w-14 text-xl" />)}</InputOTPGroup></InputOTP>
          {state.wrongOtp && <p role="alert" className="text-sm text-destructive">{text('wrongOtp')}</p>}
          <Button className="w-full min-h-12" disabled={otp.length !== 4} onClick={() => void act({ type: 'verify', code: otp })}>{text('verify')}</Button>
        </div>}
      </section>}
      {['completed', 'rejected', 'expired', 'blocked'].includes(state.step) && <section className="space-y-4 text-center py-4">
        {state.step === 'completed' ? <CheckCircle2 className="h-14 w-14 text-primary mx-auto" /> : <CircleHelp className="h-12 w-12 text-muted-foreground mx-auto" />}
        <h2 className="text-2xl font-bold">{text(state.step === 'completed' ? 'success' : state.step)}</h2>
        <p className="text-sm text-muted-foreground">{text(state.step === 'completed' ? 'successBody' : state.step === 'blocked' ? 'busy' : 'retryBody')}</p>
        <Button className="w-full min-h-12" onClick={() => navigate('/home')}>{text('home')}</Button><Button variant="outline" className="w-full min-h-12" onClick={again}><RotateCcw className="h-4 w-4 mr-2" />{text('again')}</Button>
      </section>}
      <section className="border-t border-border pt-5"><h2 className="font-semibold mb-3">{text('checks')}</h2><ul className="divide-y divide-border">{PRACTICE_CHECKS.map(key => {
        const result = state.checks[key]; const Icon = result === 'passed' ? CheckCircle2 : result === 'failed' ? XCircle : CircleHelp;
        return <li key={key} className="flex justify-between items-center gap-3 py-2.5 text-sm"><span>{text(key)}</span><span className={`inline-flex items-center gap-1.5 shrink-0 ${result === 'failed' ? 'text-destructive' : result === 'passed' ? 'text-primary' : 'text-muted-foreground'}`}><Icon className="h-4 w-4" />{text(result)}</span></li>;
      })}</ul></section>
    </main>
  </div>;
}

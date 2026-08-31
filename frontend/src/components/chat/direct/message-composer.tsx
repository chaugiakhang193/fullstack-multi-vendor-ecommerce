'use client';

import { useState } from 'react';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { MAX_DIRECT_MESSAGE_LENGTH } from '@/constants/direct-chat';

interface MessageComposerProps {
  disabled: boolean;
  onSend: (text: string) => void;
}

export default function MessageComposer({
  disabled,
  onSend,
}: MessageComposerProps) {
  const [text, setText] = useState('');
  const trimmed = text.trim();
  const tooLong = trimmed.length > MAX_DIRECT_MESSAGE_LENGTH;
  const canSend = trimmed.length > 0 && !tooLong && !disabled;

  const submit = () => {
    if (!canSend) return;
    onSend(trimmed);
    setText('');
  };

  return (
    <div className="border-t p-3">
      <div className="flex items-end gap-2">
        <Textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            // Enter gửi, Shift+Enter xuống dòng — thói quen của mọi ứng dụng nhắn tin.
            //
            // Bỏ qua khi đang gõ tiếng Việt bằng bộ gõ: isComposing là true trong lúc bộ gõ còn
            // đang ghép dấu, và Enter lúc đó là "chốt chữ", không phải "gửi tin".
            if (
              event.key === 'Enter' &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              submit();
            }
          }}
          placeholder={disabled ? 'Đang kết nối…' : 'Nhập tin nhắn…'}
          disabled={disabled}
          rows={1}
          className="max-h-32 min-h-[40px] resize-none rounded-xl focus:border-violet-500 focus:ring-violet-500/20"
        />
        <Button
          type="button"
          onClick={submit}
          disabled={!canSend}
          className="h-10 shrink-0 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-500 text-xs font-semibold text-white hover:from-violet-600 hover:to-indigo-600"
        >
          <Send className="h-4 w-4" />
          <span className="ml-1.5 hidden sm:inline">Gửi</span>
        </Button>
      </div>

      {tooLong && (
        <p className="mt-1.5 text-[10px] font-semibold text-rose-600 dark:text-rose-400">
          Tin nhắn tối đa {MAX_DIRECT_MESSAGE_LENGTH} ký tự.
        </p>
      )}
    </div>
  );
}

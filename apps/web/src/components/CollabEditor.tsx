import { useEffect, useState } from 'react';
import type * as Monaco from 'monaco-editor';
import { MonacoBinding } from 'y-monaco';
import { DOC_TEXT } from '@devhub/shared';
import type { SessionDoc } from '../lib/useSessionDoc';
import CodeEditor from './CodeEditor';

interface Props {
  session: SessionDoc;
  language: string;
  readOnly: boolean;
}

/** Binds Monaco to the session document's shared text, with remote cursors in each user's colour. */
export default function CollabEditor({ session, language, readOnly }: Props) {
  const [editor, setEditor] = useState<Monaco.editor.IStandaloneCodeEditor | null>(null);

  useEffect(() => {
    if (!editor) return;
    const { doc, awareness } = session;
    const binding = new MonacoBinding(
      doc.getText(DOC_TEXT),
      editor.getModel()!,
      new Set([editor]),
      awareness,
    );

    // y-monaco tags remote selections with per-client classes; colour them from awareness.
    const style = document.head.appendChild(document.createElement('style'));
    const paint = () => {
      const rules: string[] = [];
      awareness.getStates().forEach((state, clientId) => {
        const u = state.user as { name: string; color: string } | undefined;
        if (!u || clientId === doc.clientID) return;
        const name = u.name.replace(/["\\]/g, '');
        rules.push(
          `.yRemoteSelection-${clientId}{background:${u.color}33}`,
          `.yRemoteSelectionHead-${clientId}{position:absolute;border-left:2px solid ${u.color};height:100%}`,
          `.yRemoteSelectionHead-${clientId}::after{content:"${name}";position:absolute;top:-1.3em;left:-2px;background:${u.color};color:#fff;font:600 10px/1.4 Inter,sans-serif;padding:0 4px;border-radius:3px;white-space:nowrap}`,
        );
      });
      style.textContent = rules.join('\n');
    };
    awareness.on('change', paint);
    paint();
    return () => {
      awareness.off('change', paint);
      binding.destroy();
      style.remove();
    };
  }, [editor, session]);

  return (
    <CodeEditor
      height="100%"
      language={language}
      defaultValue=""
      options={{
        readOnly,
        readOnlyMessage: { value: 'This session is not live, or you are a viewer.' },
      }}
      onMount={(e) => setEditor(e)}
    />
  );
}

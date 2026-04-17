"use client";

import { useRef, useCallback } from "react";
import Editor, { loader } from "@monaco-editor/react";

// 默认从 jsDelivr CDN 加载，国内无法访问，改用本地文件（构建时自动复制）
loader.config({
  paths: {
    vs: "/monaco-editor/min/vs",
  },
});

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  height?: string;
  onSelectionChange?: (selected: string) => void;
  readOnly?: boolean;
}

const DEFAULT_CODE = `#include <iostream>
using namespace std;
int main() {

    return 0;
}
`;

export { DEFAULT_CODE };

export default function CodeEditor({ value, onChange, height = "400px", onSelectionChange, readOnly = false }: CodeEditorProps) {
  const editorRef = useRef<any>(null);
  const onSelectionChangeRef = useRef(onSelectionChange);
  onSelectionChangeRef.current = onSelectionChange;

  const handleMount = useCallback((editor: any) => {
    editorRef.current = editor;

    // 默认关闭滚轮
    editor.updateOptions({ scrollbar: { handleMouseWheel: false } });

    // 获取 Monaco 的 DOM 容器
    const domNode = editor.getDomNode();
    if (domNode) {
      domNode.addEventListener("mouseenter", () => {
        editor.updateOptions({ scrollbar: { handleMouseWheel: true } });
      });
      domNode.addEventListener("mouseleave", () => {
        editor.updateOptions({ scrollbar: { handleMouseWheel: false } });
      });
    }

    // 监听选中文本变化
    editor.onDidChangeCursorSelection(() => {
      if (!onSelectionChangeRef.current) return;
      const selection = editor.getSelection();
      if (!selection || selection.isEmpty()) {
        onSelectionChangeRef.current("");
      } else {
        const selected = editor.getModel()?.getValueInRange(selection) || "";
        onSelectionChangeRef.current(selected);
      }
    });
  }, []);

  return (
    <div style={{ height }}>
      <Editor
        height="100%"
        language="cpp"
        theme="vs-dark"
        value={value}
        onChange={(v) => onChange(v || "")}
        onMount={handleMount}
        options={{
          fontSize: 14,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          wordWrap: "on",
          tabSize: 4,
          automaticLayout: true,
          readOnly,
        }}
      />
    </div>
  );
}

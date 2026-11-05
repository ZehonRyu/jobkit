#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
求职工坊 · 本地服务

作用有两个：
1. 托管静态页面（和 python -m http.server 一样）
2. 代理大模型接口（POST /api/chat），把 API Key 留在本机，不暴露给浏览器

用法：
    python serve.py                # 默认 8770 端口
    python serve.py --port 9000

第一次使用：页面里点「配置 Key」，粘贴 DeepSeek 的 key 即可（存到同目录 config.json）。
也可以用环境变量：DEEPSEEK_API_KEY / LLM_BASE_URL / LLM_MODEL
"""

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(ROOT, "config.json")

DEFAULTS = {
    "base_url": "https://api.deepseek.com",
    "model": "deepseek-chat",
    "api_key": "",
}


def load_config():
    cfg = dict(DEFAULTS)
    if os.path.exists(CONFIG_PATH):
        try:
            # utf-8-sig：Windows 记事本/部分编辑器会写 BOM，按 utf-8 读会直接报错
            with open(CONFIG_PATH, "r", encoding="utf-8-sig") as f:
                cfg.update(json.load(f) or {})
        except Exception as e:
            sys.stderr.write("config.json 读取失败：%s\n" % e)
    # 环境变量优先级最高，方便临时覆盖
    if os.environ.get("DEEPSEEK_API_KEY"):
        cfg["api_key"] = os.environ["DEEPSEEK_API_KEY"]
    if os.environ.get("LLM_BASE_URL"):
        cfg["base_url"] = os.environ["LLM_BASE_URL"]
    if os.environ.get("LLM_MODEL"):
        cfg["model"] = os.environ["LLM_MODEL"]
    return cfg


def save_config(patch):
    cfg = load_config()
    for k in ("base_url", "model", "api_key"):
        if k in patch and patch[k] is not None:
            cfg[k] = str(patch[k]).strip()
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)
    return cfg


def _open(req, timeout=180):
    """先按环境变量走代理，失败再直连（国内网络两种情况都常见）"""
    try:
        return urllib.request.urlopen(req, timeout=timeout)
    except urllib.error.HTTPError:
        raise
    except Exception:
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        return opener.open(req, timeout=timeout)


class Handler(SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.0"

    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def log_message(self, fmt, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def _json(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.split("?")[0] == "/api/status":
            cfg = load_config()
            self._json({
                "configured": bool(cfg.get("api_key")),
                "base_url": cfg.get("base_url"),
                "model": cfg.get("model"),
            })
            return
        return super().do_GET()

    def do_POST(self):
        path = self.path.split("?")[0]
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b"{}"
        try:
            payload = json.loads(raw.decode("utf-8") or "{}")
        except Exception:
            self._json({"error": "请求体不是合法 JSON"}, 400)
            return

        if path == "/api/config":
            cfg = save_config(payload)
            self._json({
                "ok": True,
                "configured": bool(cfg.get("api_key")),
                "base_url": cfg.get("base_url"),
                "model": cfg.get("model"),
            })
            return

        if path == "/api/chat":
            self._chat(payload)
            return

        self._json({"error": "未知接口 " + path}, 404)

    def _chat(self, payload):
        cfg = load_config()
        if not cfg.get("api_key"):
            self._json({"error": "还没有配置 API Key。点右上角「配置 Key」填写 DeepSeek 的 key。"}, 400)
            return

        messages = payload.get("messages") or []
        if not isinstance(messages, list) or not messages:
            self._json({"error": "messages 为空"}, 400)
            return

        body = {
            "model": cfg.get("model") or "deepseek-chat",
            "messages": messages,
            "stream": True,
            "temperature": payload.get("temperature", 0.6),
            "max_tokens": payload.get("max_tokens", 1600),
        }
        base = str(cfg.get("base_url") or "").rstrip("/")
        url = base + "/chat/completions"
        req = urllib.request.Request(
            url,
            data=json.dumps(body).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "Authorization": "Bearer " + cfg["api_key"],
                "Accept": "text/event-stream",
            },
            method="POST",
        )

        try:
            resp = _open(req)
        except urllib.error.HTTPError as e:
            detail = ""
            try:
                detail = e.read().decode("utf-8", "ignore")[:400]
            except Exception:
                pass
            self._json({"error": "模型接口返回 %s：%s" % (e.code, detail)}, 502)
            return
        except Exception as e:
            self._json({"error": "连不上模型接口（%s）。如果本机需要代理，请在启动前设置 HTTPS_PROXY。" % e}, 502)
            return

        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Accel-Buffering", "no")
        self.end_headers()

        try:
            while True:
                line = resp.readline()
                if not line:
                    break
                self.wfile.write(line)
                self.wfile.flush()
        except Exception:
            pass
        finally:
            try:
                resp.close()
            except Exception:
                pass


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8770)
    ap.add_argument("--host", default="127.0.0.1")
    args = ap.parse_args()

    cfg = load_config()
    print("求职工坊 · 本地服务")
    print("  地址：http://%s:%d" % (args.host, args.port))
    print("  模型：%s（%s）" % (cfg.get("model"), "已配置 Key" if cfg.get("api_key") else "未配置 Key"))
    print("  Ctrl+C 停止")
    ThreadingHTTPServer((args.host, args.port), Handler).serve_forever()


if __name__ == "__main__":
    main()

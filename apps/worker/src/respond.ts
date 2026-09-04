/** 成功。API の返り値はすべてこの封筒に入る。 */
export function ok<T>(data: T): Response {
  return Response.json({ ok: true, data });
}

/** 失敗。理由は人が読める文字列で返す。内部の詳細は載せない。 */
export function fail(message: string, status = 400): Response {
  return Response.json({ ok: false, error: message }, { status });
}

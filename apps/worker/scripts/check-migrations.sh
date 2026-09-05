#!/bin/sh
# 本番に未適用のマイグレーションが残っていないかを確かめる。
#
# 2026-09-05、移行を適用しないままデプロイして、新しいコードが存在しない列を
# 参照する状態を作った。そこで release にまとめたが、wrangler は移行の適用時に
# 対話で確認を求めるため、まとめた手順の中では止まってしまう。
#
# **自動で承認しない。** スキーマ変更は取り消しが利かないので、人が見て走らせる
# べきものである。ここでは「残っているなら大声で止める」ことだけを担う。
# 黙って進むより、止まって手順を示すほうがよい。
set -e

output=$(wrangler d1 migrations list minna-quest --remote 2>&1)

if printf '%s' "$output" | grep -q 'No migrations to apply'; then
  echo "未適用のマイグレーションはありません。"
  exit 0
fi

echo "$output"
echo
echo "未適用のマイグレーションがあります。先に次を実行してください:"
echo "  cd apps/worker && npx wrangler d1 migrations apply minna-quest --remote"
echo
echo "適用せずにデプロイすると、新しいコードが存在しない列を参照して本番が壊れます。"
exit 1

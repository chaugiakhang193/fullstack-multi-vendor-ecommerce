-- Hai partial index con thieu cua bang participant.
--
-- participant_conversation_user_uniq (000001) chi phu cac dong co user_id IS NOT NULL. Ma
-- constraint participant_identity_exactly_one bat participant cua BOT phai co ca user_id lan
-- guest_key deu NULL, va participant cua KHACH chi co guest_key. Hai loai do khong dong nao bi
-- rang buoc chan trung.
--
-- Doc-truoc-roi-INSERT o tang app khong cuu duoc: hai request cung SELECT thay rong roi cung
-- INSERT, va vi khong co unique index nen ca hai deu thanh cong. Dung dieu ma comment cua
-- 000001 da canh bao khi chon partial index thay vi kiem o tang app.
--
-- Hau qua khong dung lai o mot dong thua. GetParticipantByRole dung LIMIT 1 nen tra ve mot
-- trong hai dong tuy luc; tin nhan da ghi duoi participant nay se bi luot sau doc thanh cua
-- NGUOI DUNG thay vi cua bot, va model se tuong minh dang doc lai loi nguoi dung noi.
CREATE UNIQUE INDEX participant_conversation_bot_uniq
    ON participant (conversation_id)
    WHERE role = 'bot';

-- Doi xung voi participant_conversation_user_uniq, cho khach vang lai.
CREATE UNIQUE INDEX participant_conversation_guest_uniq
    ON participant (conversation_id, guest_key)
    WHERE guest_key IS NOT NULL;

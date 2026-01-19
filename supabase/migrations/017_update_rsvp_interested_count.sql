-- Update event attendees count trigger to also track rsvpInterested (saves)
-- This makes "Interested" work like a save button and boosts event popularity ranking

CREATE OR REPLACE FUNCTION update_event_attendees_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.events 
    SET counts = jsonb_set(
      jsonb_set(
        COALESCE(counts, '{}'::jsonb),
        '{rsvpGoing}',
        to_jsonb(COALESCE((counts->>'rsvpGoing')::int, 0) + CASE WHEN NEW.status = 'going' THEN 1 ELSE 0 END)
      ),
      '{rsvpInterested}',
      to_jsonb(COALESCE((counts->>'rsvpInterested')::int, 0) + CASE WHEN NEW.status = 'interested' THEN 1 ELSE 0 END)
    )
    WHERE id = NEW.event_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.events 
    SET counts = jsonb_set(
      jsonb_set(
        COALESCE(counts, '{}'::jsonb),
        '{rsvpGoing}',
        to_jsonb(GREATEST(COALESCE((counts->>'rsvpGoing')::int, 0) - CASE WHEN OLD.status = 'going' THEN 1 ELSE 0 END, 0))
      ),
      '{rsvpInterested}',
      to_jsonb(GREATEST(COALESCE((counts->>'rsvpInterested')::int, 0) - CASE WHEN OLD.status = 'interested' THEN 1 ELSE 0 END, 0))
    )
    WHERE id = OLD.event_id;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Handle status changes for both going and interested
    UPDATE public.events 
    SET counts = jsonb_set(
      jsonb_set(
        COALESCE(counts, '{}'::jsonb),
        '{rsvpGoing}',
        to_jsonb(
          COALESCE((counts->>'rsvpGoing')::int, 0) + 
          CASE WHEN NEW.status = 'going' AND OLD.status != 'going' THEN 1
               WHEN OLD.status = 'going' AND NEW.status != 'going' THEN -1
               ELSE 0 END
        )
      ),
      '{rsvpInterested}',
      to_jsonb(
        COALESCE((counts->>'rsvpInterested')::int, 0) + 
        CASE WHEN NEW.status = 'interested' AND OLD.status != 'interested' THEN 1
             WHEN OLD.status = 'interested' AND NEW.status != 'interested' THEN -1
             ELSE 0 END
      )
    )
    WHERE id = NEW.event_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

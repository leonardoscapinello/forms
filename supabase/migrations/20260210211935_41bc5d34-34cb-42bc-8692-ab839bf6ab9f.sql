-- Enable realtime for forms table so changes propagate to all connected clients
ALTER PUBLICATION supabase_realtime ADD TABLE public.forms;
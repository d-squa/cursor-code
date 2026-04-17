
DELETE FROM public.campaign_insights WHERE is_sample = true;
DELETE FROM public.campaign_launch_status WHERE is_sample = true;
DELETE FROM public.creative_assignments WHERE is_sample = true;
DELETE FROM public.activity_logs WHERE is_sample = true;
DELETE FROM public.campaign_change_history WHERE is_sample = true;
DELETE FROM public.campaigns WHERE is_sample = true;
DELETE FROM public.connected_platforms WHERE is_sample = true;
DELETE FROM public.clients WHERE name = 'D-squad';
DELETE FROM public.tour_data_state;

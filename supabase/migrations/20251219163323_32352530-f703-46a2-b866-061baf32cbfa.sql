-- Drop existing policy and create a new one that includes campaign_manager
DROP POLICY IF EXISTS "Admins can manage operation defaults" ON client_operation_defaults;

CREATE POLICY "Team leads can manage operation defaults"
ON client_operation_defaults
FOR ALL
USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'owner'::app_role) OR 
  has_role(auth.uid(), 'campaign_manager'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'owner'::app_role) OR 
  has_role(auth.uid(), 'campaign_manager'::app_role)
);